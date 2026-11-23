import type { Readable } from "node:stream";
import { HttpError } from "@/server/lib/http";
import {
  classifyVidaraApiResponse,
  deriveInlinePlayerUrlFromProviderUrl,
  extractVidaraFilecode,
  inspectVidaraUrl,
  isCorruptedVidaraFilecode,
  isRawVidaraFilecode,
  parseDirectUploadResponse,
  parseFileInfoResponse,
  parseUploadUrlResponse,
  parseVideoListResponse,
  resolveVerifiedInlinePlaybackUrl,
  tryExtractVidaraFilecode,
  type VidaraDirectUploadResult,
  type VidaraErrorCode,
  type VidaraListResult,
  type VidaraVideoMeta,
} from "@/server/services/vidara-parse";
import { postMultipartVideoStream, StreamUploadError } from "@/server/services/vidara-stream";

/**
 * Vidara.so API integration — the ONLY module where Vidara endpoints,
 * credentials, and transport handling live. All calls are server-side; the
 * API key is read strictly from `process.env.VIDARA_API_KEY` and is never
 * logged or exposed to the browser.
 *
 * Every method taking a `filecode` normalizes and validates it with
 * `extractVidaraFilecode(...)` before calling Vidara's API so an embed/share
 * URL can NEVER be sent as the `filecode` query parameter.
 */

const API_BASE = "https://api.vidara.so/v1";
const TIMEOUT_MS = 15_000;
const UPLOAD_RESPONSE_TIMEOUT_MS = 10 * 60 * 1000;

export class VidaraError extends HttpError {
  readonly code: VidaraErrorCode;
  readonly upstreamStatus?: number;

  constructor(
    status: number,
    message: string,
    code: VidaraErrorCode = "UPSTREAM_ERROR",
    upstreamStatus?: number,
  ) {
    super(status, message);
    this.name = "VidaraError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

export interface VidaraAccountInfo {
  username: string | null;
  email: string | null;
  premium: string | null;
  premiumExpire: string | null;
  storageUsedBytes: number | null;
  storageLeftLabel: string | null;
  videosTotal: number | null;
}

export interface VidaraEncodingStatus {
  inProgress: boolean;
  total: number;
  encodings: Array<{ type: string; progress: string; lastUpdate: string | null }>;
}

export type { VidaraDirectUploadResult, VidaraErrorCode, VidaraListResult, VidaraVideoMeta };
export {
  classifyVidaraApiResponse,
  deriveInlinePlayerUrlFromProviderUrl,
  extractVidaraFilecode,
  inspectVidaraUrl,
  isCorruptedVidaraFilecode,
  isRawVidaraFilecode,
  resolveVerifiedInlinePlaybackUrl,
  tryExtractVidaraFilecode,
};

export function isVidaraConfigured(): boolean {
  return Boolean(process.env.VIDARA_API_KEY?.trim());
}

/** Configurable upload limit (MB via `MAX_UPLOAD_MB`, default 2048 MB = 2 GB). */
export function getMaxUploadBytes(): number {
  const rawMb = Number.parseInt(process.env.MAX_UPLOAD_MB ?? "2048", 10);
  const safeMb = Number.isFinite(rawMb) && rawMb >= 10 && rawMb <= 10240 ? rawMb : 2048;
  return safeMb * 1024 * 1024;
}

function apiKey(): string {
  const key = process.env.VIDARA_API_KEY?.trim();
  if (!key) {
    throw new VidaraError(
      503,
      "Vidara is not configured. Set the VIDARA_API_KEY environment variable on the server.",
      "NOT_CONFIGURED",
    );
  }
  return key;
}

function requireRawFilecode(input: string): string {
  try {
    return extractVidaraFilecode(input);
  } catch (err) {
    throw new VidaraError(
      400,
      err instanceof Error ? err.message : "Invalid Vidara filecode or URL.",
      "INVALID_INPUT",
    );
  }
}

/** Backwards-compatible alias that throws VidaraError(400) on invalid inputs. */
export function extractFilecode(input: string): string {
  return requireRawFilecode(input);
}

/**
 * Vidara's published docs list `key` in the parameter table and `api_key` in
 * both the HTML Form and cURL examples. Default `"both"` includes both small
 * text fields (~120 bytes) before the file stream so whichever field Vidara's
 * upload handler reads succeeds on the first pass.
 */
function getUploadKeyFields(): Array<"api_key" | "key"> {
  const mode = (process.env.VIDARA_UPLOAD_KEY_FIELD ?? "both").trim().toLowerCase();
  if (mode === "api_key") return ["api_key"];
  if (mode === "key") return ["key"];
  return ["api_key", "key"];
}

interface VidaraEnvelope {
  msg?: string;
  status?: number;
  result?: unknown;
  data?: unknown;
}

async function vidaraGet(path: string, params: Record<string, string>): Promise<VidaraEnvelope> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new VidaraError(
      504,
      "Vidara did not respond in time. Please try again shortly.",
      "TIMEOUT",
    );
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  const classified = classifyVidaraApiResponse({
    httpStatus: response.status,
    body,
    rawText: text,
  });

  if (!classified.ok) {
    throw new VidaraError(
      classified.code === "AUTH_ERROR" ? 502 : classified.httpStatus,
      classified.message,
      classified.code,
      classified.providerStatus,
    );
  }

  return classified.envelope;
}

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** GET /v1/user/info — account username, premium state, storage and totals. */
export async function getAccountInfo(): Promise<VidaraAccountInfo> {
  const body = await vidaraGet("/user/info", { api_key: apiKey() });
  const result = (body.result ?? {}) as Record<string, unknown>;
  const storageLeft = result.storage_left;
  return {
    username: typeof result.username === "string" ? result.username : null,
    email: typeof result.email === "string" ? result.email : null,
    premium: typeof result.premium === "string" ? result.premium : null,
    premiumExpire: typeof result.premium_expire === "string" ? result.premium_expire : null,
    storageUsedBytes: toIntOrNull(result.storage_used),
    storageLeftLabel:
      typeof storageLeft === "string"
        ? storageLeft
        : toIntOrNull(storageLeft) !== null
          ? `${toIntOrNull(storageLeft)} bytes`
          : null,
    videosTotal: toIntOrNull(result.videos_total),
  };
}

/** GET /v1/upload/server — returns the active Vidara upload server URL. */
export async function getUploadServer(): Promise<string> {
  const body = await vidaraGet("/upload/server", { api_key: apiKey() });
  const result = (body.result ?? {}) as Record<string, unknown>;
  const server = typeof result.upload_server === "string" ? result.upload_server.trim() : "";
  if (!server) {
    throw new VidaraError(502, "Vidara did not return an upload server URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(server);
  } catch {
    throw new VidaraError(502, "Vidara returned an invalid upload server URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new VidaraError(502, "Vidara returned a non-HTTP upload server URL.");
  }
  return parsed.href;
}

export interface StreamUploadOptions {
  fileStream: Readable;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  maxBytes: number;
  uploadServerOverride?: string;
  apiKeyOverride?: string;
  signal?: AbortSignal;
  onProgress?: (transferredBytes: number, totalBytes: number) => void;
}

export interface StreamUploadOutcome {
  upload: VidaraDirectUploadResult;
  bytesTransferred: number;
  uploadServerHost: string;
}

export async function streamUploadToVidara(
  options: StreamUploadOptions,
): Promise<StreamUploadOutcome> {
  const key = options.apiKeyOverride ?? apiKey();
  const uploadServerUrl = options.uploadServerOverride ?? (await getUploadServer());

  let raw;
  try {
    raw = await postMultipartVideoStream({
      targetUrl: uploadServerUrl,
      apiKey: key,
      keyFields: getUploadKeyFields(),
      fileStream: options.fileStream,
      filename: options.filename,
      contentType: options.contentType,
      fileSizeBytes: options.fileSizeBytes,
      maxBytes: options.maxBytes,
      timeoutMs: UPLOAD_RESPONSE_TIMEOUT_MS,
      signal: options.signal,
      onProgress: options.onProgress,
    });
  } catch (err) {
    if (err instanceof StreamUploadError) {
      throw new VidaraError(err.status, err.message);
    }
    throw err;
  }

  if (raw.statusCode === 401 || raw.statusCode === 403) {
    throw new VidaraError(
      502,
      `Vidara upload server authentication/permission error (HTTP ${raw.statusCode}): verify that VIDARA_API_KEY is valid.`,
      "AUTH_ERROR",
      raw.statusCode,
    );
  }

  if (raw.statusCode < 200 || raw.statusCode >= 300) {
    const body = raw.parsedJson as { msg?: unknown; error?: unknown } | null;
    const msg =
      typeof body?.msg === "string"
        ? body.msg
        : typeof body?.error === "string"
          ? body.error
          : raw.rawBody.slice(0, 180) || `Vidara upload server returned HTTP ${raw.statusCode}.`;
    throw new VidaraError(502, msg);
  }

  const upload = parseDirectUploadResponse(raw.parsedJson);
  if (!upload) {
    throw new VidaraError(
      502,
      "Vidara upload server returned an unreadable response (no valid filecode).",
    );
  }

  return {
    upload,
    bytesTransferred: raw.bytesTransferred,
    uploadServerHost: raw.uploadServerHost,
  };
}

/** GET /v1/upload/thumb — optional sync of a public HTTPS thumbnail URL to Vidara. */
export async function syncThumbnailUrlToVidara(filecode: string, thumbUrl: string): Promise<boolean> {
  if (!isVidaraConfigured()) return false;
  try {
    const rawCode = requireRawFilecode(filecode);
    const parsed = new URL(thumbUrl);
    if (parsed.protocol !== "https:") return false;
    await vidaraGet("/upload/thumb", {
      api_key: apiKey(),
      filecode: rawCode,
      thumb_url: parsed.href,
    });
    return true;
  } catch {
    return false;
  }
}

/** GET /v1/upload/url — legacy server-side URL import (kept for backward API compatibility). */
export async function importFromUrl(
  url: string,
  options: { name?: string } = {},
): Promise<{ filecode: string; title: string | null; sizeBytes: number | null }> {
  const params: Record<string, string> = { api_key: apiKey(), url };
  if (options.name) params.name = options.name;
  const body = await vidaraGet("/upload/url", params);
  const parsed = parseUploadUrlResponse(body);
  if (!parsed) {
    throw new VidaraError(502, "Vidara did not return a valid filecode for this import.");
  }
  return parsed;
}

/** GET /v1/video/info — always sends ONLY the validated raw filecode. */
export async function getVideoInfo(filecode: string): Promise<VidaraVideoMeta> {
  const rawCode = requireRawFilecode(filecode);
  const body = await vidaraGet("/video/info", { api_key: apiKey(), filecode: rawCode });
  const meta = parseFileInfoResponse(body);
  if (!meta) {
    throw new VidaraError(
      404,
      `Vidara has no readable video for filecode "${rawCode}".`,
      "NOT_FOUND",
      404,
    );
  }
  return meta;
}

export type { VidaraListResult as VidaraList };

/** GET /v1/video/list — the account's videos (uses the list-response parser). */
export async function listProviderVideos(
  page: number,
  limit: number,
  title?: string,
): Promise<VidaraListResult> {
  const params: Record<string, string> = {
    api_key: apiKey(),
    page: String(Math.max(1, page)),
    limit: String(Math.min(200, Math.max(1, limit))),
  };
  if (title) params.title = title;
  const body = await vidaraGet("/video/list", params);
  return parseVideoListResponse(body);
}

/** GET /v1/video/status — encoding progress; always sends ONLY the raw filecode. */
export async function getEncodingStatus(filecode: string): Promise<VidaraEncodingStatus> {
  const rawCode = requireRawFilecode(filecode);
  const body = await vidaraGet("/video/status", { api_key: apiKey(), filecode: rawCode });
  const result = (body.result ?? {}) as Record<string, unknown>;
  const rawEncodings = Array.isArray(result.encodings) ? result.encodings : [];
  return {
    inProgress: rawEncodings.length > 0,
    total: rawEncodings.length,
    encodings: rawEncodings.map((e) => {
      const enc = e as Record<string, unknown>;
      return {
        type: typeof enc.type === "string" ? enc.type : "encode",
        progress: typeof enc.progress_percentage === "string" ? enc.progress_percentage : "0%",
        lastUpdate: typeof enc.last_update === "string" ? enc.last_update : null,
      };
    }),
  };
}

/** GET /v1/video/rename — renames the video on Vidara using ONLY the raw filecode. */
export async function renameProviderVideo(filecode: string, title: string): Promise<boolean> {
  const rawCode = requireRawFilecode(filecode);
  await vidaraGet("/video/rename", {
    api_key: apiKey(),
    filecode: rawCode,
    title: title.slice(0, 300),
  });
  return true;
}

/** GET /v1/video/delete — soft-deletes the video on Vidara using ONLY the raw filecode. */
export async function deleteProviderVideo(filecode: string): Promise<boolean> {
  const rawCode = requireRawFilecode(filecode);
  const body = await vidaraGet("/video/delete", { api_key: apiKey(), filecode: rawCode });
  const result = (body.result ?? {}) as Record<string, unknown>;
  return result.deleted === true;
}
