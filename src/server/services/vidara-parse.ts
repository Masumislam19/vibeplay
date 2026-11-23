/**
 * Vidara API response parsers, filecode extraction, error classification, and
 * verified URL helpers — pure functions with zero network or database imports,
 * so they can be shared safely and unit-tested directly against documented
 * Vidara responses (https://vidara.so/api).
 *
 * Separate parsers are used for the distinct Vidara response shapes:
 *  - /v1/video/info  → result: [{ filecode, vid_id, video_title, player_img, link,
 *                                 video_length, video_views, video_created, status, file_active }]
 *  - /v1/video/list  → result: { videos: [{ vid_id, filecode, title, thumbnail,
 *                                 length, link, views, uploaded, status, file_active }],
 *                                 results, page, per_page, total_pages, total }
 *  - POST upload     → { url, title, video_id, filecode }
 *  - /v1/upload/url  → { status, msg, data: { filecode, title, size } }
 */

export type ProviderStatus = "processing" | "ready" | "error" | "blocked";

export type VidaraErrorCode =
  | "AUTH_ERROR"
  | "NOT_CONFIGURED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "UPSTREAM_ERROR";

export interface VidaraVideoMeta {
  /** Raw Vidara filecode ONLY (e.g. "9jWkXi1HtNhOS"). Never a URL. */
  filecode: string;
  videoId: number | null;
  title: string | null;
  thumbnailUrl: string | null;
  /** Exact canonical playback/share URL returned by Vidara (`link`), or null if absent. */
  playbackUrl: string | null;
  /** Verified inline provider embed URL derived strictly from Vidara's returned URL. */
  embedUrl: string | null;
  /** Backwards-compatible alias for canonical provider URL. */
  shareUrl: string | null;
  durationSeconds: number | null;
  providerViews: number | null;
  providerCreatedAt: string | null;
  /** Exact `file_active` flag from Vidara (1 => true, 0 => false, absent => null). */
  fileActive: boolean | null;
  providerStatus: ProviderStatus;
}

export interface VidaraDirectUploadResult {
  /** Raw Vidara filecode ONLY. */
  filecode: string;
  videoId: number | null;
  title: string | null;
  /** Exact `url` returned by Vidara's upload server (never modified or domain-swapped). */
  url: string | null;
  /** Canonical playback URL returned by Vidara. */
  playbackUrl: string | null;
  /** Verified inline embed URL on the exact host returned by Vidara, or null. */
  embedUrl: string | null;
}

export interface VidaraListResult {
  videos: VidaraVideoMeta[];
  total: number | null;
  page: number | null;
  perPage: number | null;
  totalPages: number | null;
  results: number | null;
}

/** Supported Vidara root domains for filecode extraction. */
const SUPPORTED_VIDARA_ROOT_DOMAINS = ["vidara.so", "vidara.to"] as const;

/** Raw Vidara filecodes are 5–32 URL-safe alphanumeric / underscore / hyphen characters. */
const RAW_FILECODE_PATTERN = /^[A-Za-z0-9_-]{5,32}$/;

/** Known site routes that are NOT video filecodes. */
const RESERVED_PATH_SEGMENTS = new Set([
  "api",
  "v",
  "e",
  "embed",
  "watch",
  "login",
  "logout",
  "register",
  "signup",
  "upload",
  "ftp-upload",
  "dashboard",
  "contact",
  "tos",
  "terms",
  "privacy",
  "dmca",
  "reports",
  "payouts",
  "assets",
  "static",
]);

/** Video file extensions documented as supported by Vidara. */
export const ALLOWED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".m4v",
  ".flv",
  ".wmv",
  ".3gp",
  ".mpg",
  ".mpeg",
  ".ts",
]);

/** Accepted video MIME types (also permits application/octet-stream when extension is valid). */
export const ALLOWED_VIDEO_MIME_PREFIXES = ["video/"];

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toFileActive(value: unknown): boolean | null {
  const num = toIntOrNull(value);
  if (num === 1) return true;
  if (num === 0) return false;
  if (typeof value === "boolean") return value;
  return null;
}

export function isSupportedVidaraHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return SUPPORTED_VIDARA_ROOT_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/** Returns true if `value` is strictly a raw Vidara filecode (not a URL or path). */
export function isRawVidaraFilecode(value: string | null | undefined): boolean {
  const trimmed = toTrimmedString(value);
  if (!trimmed) return false;
  if (RESERVED_PATH_SEGMENTS.has(trimmed.toLowerCase())) return false;
  return RAW_FILECODE_PATTERN.test(trimmed);
}

/** Returns true if a stored `filecode` field is malformed (e.g. contains a URL or `/e/` or `/v/`). */
export function isCorruptedVidaraFilecode(value: string | null | undefined): boolean {
  const trimmed = toTrimmedString(value);
  if (!trimmed) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#")) return true;
  return !isRawVidaraFilecode(trimmed);
}

/**
 * Extracts and validates the raw Vidara filecode from either a raw filecode
 * string or a supported Vidara URL using the standard WHATWG `URL` parser.
 *
 * Supported inputs:
 *  - Raw filecode: `9jWkXi1HtNhOS`
 *  - `https://vidara.so/{FILECODE}`
 *  - `https://vidara.so/v/{FILECODE}`
 *  - `https://vidara.so/e/{FILECODE}`
 *  - `https://vidara.to/{FILECODE}`
 *  - `https://vidara.to/v/{FILECODE}`
 *  - `https://vidara.to/e/{FILECODE}`
 *  (including trailing slashes, query strings, hashes, and `www.` subdomains)
 *
 * Rejects unrelated external domains, unsupported paths, embedded credentials,
 * and malformed filecodes by throwing an `Error`.
 */
export function extractVidaraFilecode(value: string): string {
  const trimmed = toTrimmedString(value);
  if (!trimmed) {
    throw new Error("A Vidara filecode or Vidara URL is required.");
  }

  // Raw filecode (no scheme, no slashes, no query/hash, no dots)
  if (!trimmed.includes("://") && !trimmed.includes("/") && !trimmed.includes("?") && !trimmed.includes("#")) {
    if (isRawVidaraFilecode(trimmed)) {
      return trimmed;
    }
    throw new Error(`Invalid Vidara filecode "${trimmed.slice(0, 64)}".`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid Vidara URL or filecode.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP/HTTPS Vidara URLs are supported.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Vidara URLs with embedded credentials are not allowed.");
  }

  if (!isSupportedVidaraHostname(parsed.hostname)) {
    throw new Error(
      `Unsupported host "${parsed.hostname}". Only vidara.so and vidara.to URLs are accepted.`,
    );
  }

  const segments = parsed.pathname
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg).trim();
      } catch {
        return seg.trim();
      }
    })
    .filter(Boolean);

  let candidate: string | null = null;
  if (segments.length === 1) {
    candidate = segments[0];
  } else if (segments.length === 2) {
    const prefix = segments[0].toLowerCase();
    if (prefix === "v" || prefix === "e") {
      candidate = segments[1];
    } else {
      throw new Error(
        `Unsupported Vidara URL path "/${segments[0]}/...". Expected /{filecode}, /v/{filecode}, or /e/{filecode}.`,
      );
    }
  } else {
    throw new Error("No valid Vidara filecode segment was found in that URL.");
  }

  if (!candidate || !isRawVidaraFilecode(candidate)) {
    throw new Error("The extracted Vidara filecode is invalid.");
  }

  return candidate;
}

/** Non-throwing variant of `extractVidaraFilecode` for defensive reads. */
export function tryExtractVidaraFilecode(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return extractVidaraFilecode(value);
  } catch {
    return null;
  }
}

function firstHttpUrl(value: unknown): string | null {
  const raw = toTrimmedString(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Inspects a Vidara URL (such as a corrupted `filecode` value like
 * `https://vidara.to/e/9jWkXi1HtNhOS`) and cleanly separates it into:
 *  - `filecode`: raw code (`9jWkXi1HtNhOS`)
 *  - `playbackUrl`: canonical provider URL (`https://vidara.to/9jWkXi1HtNhOS` or `/v/...`)
 *  - `embedUrl`: inline embed URL on the exact same host (`https://vidara.to/e/9jWkXi1HtNhOS`)
 */
export function inspectVidaraUrl(value: string | null | undefined): {
  filecode: string;
  playbackUrl: string;
  embedUrl: string;
} | null {
  const safe = firstHttpUrl(value);
  if (!safe) return null;
  const filecode = tryExtractVidaraFilecode(safe);
  if (!filecode) return null;

  try {
    const parsed = new URL(safe);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const cleanOrigin = parsed.origin;
    const encoded = encodeURIComponent(filecode);

    if (segments.length === 2 && segments[0].toLowerCase() === "e") {
      return {
        filecode,
        playbackUrl: `${cleanOrigin}/v/${encoded}`,
        embedUrl: `${cleanOrigin}/e/${encoded}`,
      };
    }
    if (segments.length === 2 && segments[0].toLowerCase() === "v") {
      return {
        filecode,
        playbackUrl: `${cleanOrigin}/v/${encoded}`,
        embedUrl: `${cleanOrigin}/e/${encoded}`,
      };
    }
    return {
      filecode,
      playbackUrl: `${cleanOrigin}/${encoded}`,
      embedUrl: `${cleanOrigin}/e/${encoded}`,
    };
  } catch {
    return null;
  }
}

/**
 * Maps Vidara's file state. `file_active: 0` means the file is not playable
 * (blocked/inactive) even when `status` still reads "active".
 */
function mapFileStatus(status: unknown, fileActive: unknown): ProviderStatus {
  const normalized = toTrimmedString(status)?.toLowerCase();
  if (normalized === "blocked") return "blocked";
  if (normalized === "error") return "error";
  const active = toFileActive(fileActive);
  if (active === false) return "blocked";
  if (normalized === "active") return "ready";
  return "processing";
}

function toDuration(value: unknown): number | null {
  const seconds = toIntOrNull(value);
  return seconds !== null && seconds >= 0 ? seconds : null;
}

/**
 * Classifies a Vidara HTTP/JSON response, distinguishing HTTP 401/403 API
 * authentication/permission errors from missing videos or transient upstream errors.
 */
export function classifyVidaraApiResponse(input: {
  httpStatus: number;
  body: unknown;
  rawText: string;
}):
  | { ok: true; envelope: { msg?: string; status?: number; result?: unknown; data?: unknown } }
  | { ok: false; code: VidaraErrorCode; httpStatus: number; providerStatus: number; message: string } {
  const trimmed = input.rawText.trim().slice(0, 200);
  const envelope =
    typeof input.body === "object" && input.body !== null
      ? (input.body as { msg?: unknown; status?: unknown; result?: unknown; data?: unknown })
      : null;

  const providerStatus =
    envelope && typeof envelope.status === "number" ? envelope.status : input.httpStatus;

  const rawMsg =
    envelope && typeof envelope.msg === "string" && envelope.msg.trim()
      ? envelope.msg.trim()
      : trimmed;

  // Explicit HTTP 401 / 403 or API-key authentication/permission rejection
  if (
    input.httpStatus === 401 ||
    input.httpStatus === 403 ||
    providerStatus === 401 ||
    providerStatus === 403 ||
    /\b(missing api_key|invalid api_key|unauthorized|forbidden)\b/i.test(rawMsg)
  ) {
    const statusLabel = providerStatus === 401 || input.httpStatus === 401 ? 401 : 403;
    return {
      ok: false,
      code: "AUTH_ERROR",
      httpStatus: statusLabel,
      providerStatus: statusLabel,
      message: `Vidara API authentication/permission error (HTTP ${statusLabel}): verify that VIDARA_API_KEY is valid and authorized.${rawMsg ? ` Provider message: ${rawMsg}` : ""}`,
    };
  }

  if (!envelope) {
    if (input.httpStatus === 200 && trimmed.toLowerCase() === "ok") {
      return { ok: true, envelope: { status: 200, msg: "OK" } };
    }
    return {
      ok: false,
      code: input.httpStatus === 404 ? "NOT_FOUND" : "UPSTREAM_ERROR",
      httpStatus: input.httpStatus >= 400 && input.httpStatus < 500 ? input.httpStatus : 502,
      providerStatus: input.httpStatus,
      message: trimmed || `Vidara returned an unexpected response (HTTP ${input.httpStatus}).`,
    };
  }

  if (providerStatus !== 200) {
    const isNotFound = providerStatus === 404 || /\bnot found\b/i.test(rawMsg);
    return {
      ok: false,
      code: isNotFound ? "NOT_FOUND" : "UPSTREAM_ERROR",
      httpStatus: isNotFound ? 404 : providerStatus >= 400 && providerStatus < 500 ? 400 : 502,
      providerStatus,
      message: rawMsg || `Vidara request failed (status ${providerStatus}).`,
    };
  }

  return {
    ok: true,
    envelope: {
      msg: typeof envelope.msg === "string" ? envelope.msg : undefined,
      status: providerStatus,
      result: envelope.result,
      data: envelope.data,
    },
  };
}

/**
 * Derives Vidara's inline iframe embed URL strictly from a verified URL
 * returned by Vidara itself — NEVER invents a URL from a bare filecode and
 * NEVER swaps domains (`vidara.so` stays `vidara.so`, `vidara.to` stays `vidara.to`).
 */
export function deriveInlinePlayerUrlFromProviderUrl(
  providerUrl: string | null | undefined,
  filecode: string,
): string | null {
  const safe = firstHttpUrl(providerUrl);
  if (!safe) return null;

  const rawCode = tryExtractVidaraFilecode(filecode) ?? tryExtractVidaraFilecode(safe);
  try {
    const parsed = new URL(safe);
    const segments = parsed.pathname.split("/").filter(Boolean);

    if (rawCode && isSupportedVidaraHostname(parsed.hostname)) {
      // Exact inline player URL already: https://<host>/{filecode} or https://<host>/e/{filecode}
      if (segments.length === 1 && segments[0] === rawCode) {
        return `${parsed.origin}/e/${encodeURIComponent(rawCode)}`;
      }
      if (segments.length === 2 && segments[0].toLowerCase() === "e" && segments[1] === rawCode) {
        return `${parsed.origin}/e/${encodeURIComponent(rawCode)}`;
      }
      // Share page URL returned by upload: https://<host>/v/{filecode} -> https://<host>/e/{filecode}
      if (segments.length === 2 && segments[0].toLowerCase() === "v" && segments[1] === rawCode) {
        return `${parsed.origin}/e/${encodeURIComponent(rawCode)}`;
      }
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Resolves the verified inline embed/playback URL for `/watch/[id]` and Admin Preview.
 * Uses only raw extracted filecodes and verified provider URLs — never sends a
 * broken `/e/` URL as a filecode and never invents a URL from a bare filecode.
 */
export function resolveVerifiedInlinePlaybackUrl(input: {
  filecode: string;
  embedUrl?: string | null;
  playbackUrl?: string | null;
  shareUrl?: string | null;
  providerStatus?: ProviderStatus;
  fileActive?: boolean | null;
  embedTemplate?: string | null;
}): string | null {
  if (input.providerStatus === "error" || input.providerStatus === "blocked") {
    return null;
  }
  if (input.fileActive === false) {
    return null;
  }

  const rawCode = tryExtractVidaraFilecode(input.filecode) ?? input.filecode.trim();

  // 1. Optional owner-verified embed template (must be http/https and contain {filecode})
  const tpl = input.embedTemplate?.trim();
  if (tpl && tpl.includes("{filecode}") && isRawVidaraFilecode(rawCode)) {
    const candidate = tpl.replace("{filecode}", encodeURIComponent(rawCode));
    const safe = firstHttpUrl(candidate);
    if (safe) return safe;
  }

  // 2. Stored verified embedUrl
  if (input.embedUrl) {
    const fromEmbed = deriveInlinePlayerUrlFromProviderUrl(input.embedUrl, rawCode);
    if (fromEmbed) return fromEmbed;
  }

  // 3. Stored verified playbackUrl from Vidara File Info / Upload response
  if (input.playbackUrl) {
    const fromPlayback = deriveInlinePlayerUrlFromProviderUrl(input.playbackUrl, rawCode);
    if (fromPlayback) return fromPlayback;
  }

  // 4. Stored verified shareUrl from Vidara File Info / Upload response
  if (input.shareUrl) {
    const fromShare = deriveInlinePlayerUrlFromProviderUrl(input.shareUrl, rawCode);
    if (fromShare) return fromShare;
  }

  // 5. Defensive fallback: if an un-repaired legacy document still stored a valid
  //    Vidara URL in `filecode` (e.g. https://vidara.to/e/9jWkXi1HtNhOS), derive
  //    its verified embed URL instead of showing a false "Stream unavailable".
  const inspected = inspectVidaraUrl(input.filecode);
  if (inspected) {
    return inspected.embedUrl;
  }

  return null;
}

/**
 * Parser for GET /v1/video/info — always stores a clean raw `filecode`,
 * exact returned canonical `playbackUrl` (`link`), and verified `embedUrl`.
 */
export function parseFileInfoEntry(raw: unknown): VidaraVideoMeta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const rawFilecodeStr = toTrimmedString(record.filecode);
  const link = firstHttpUrl(record.link);
  const filecode =
    tryExtractVidaraFilecode(rawFilecodeStr) ?? tryExtractVidaraFilecode(link);
  if (!filecode) return null;

  const fileActive = toFileActive(record.file_active);
  const providerStatus = mapFileStatus(record.status, record.file_active);
  const isUnplayable = providerStatus === "blocked" || providerStatus === "error";
  const embedUrl = isUnplayable ? null : deriveInlinePlayerUrlFromProviderUrl(link, filecode);

  return {
    filecode,
    videoId: toIntOrNull(record.vid_id),
    title: toTrimmedString(record.video_title),
    thumbnailUrl: firstHttpUrl(record.player_img),
    playbackUrl: link,
    embedUrl,
    shareUrl: link,
    durationSeconds: toDuration(record.video_length),
    providerViews: toIntOrNull(record.video_views),
    providerCreatedAt: toTrimmedString(record.video_created),
    fileActive,
    providerStatus,
  };
}

/** Full /v1/video/info response → single metadata record (best entry available). */
export function parseFileInfoResponse(payload: unknown): VidaraVideoMeta | null {
  const result = (payload as { result?: unknown } | null)?.result;
  if (!Array.isArray(result) || result.length === 0) return null;
  const parsed = result
    .map(parseFileInfoEntry)
    .filter((entry): entry is VidaraVideoMeta => entry !== null);
  if (parsed.length === 0) return null;
  return (
    parsed.find((entry) => entry.title !== null || entry.playbackUrl !== null) ?? parsed[0]
  );
}

/**
 * Parser for GET /v1/video/list — maps documented `title`, `thumbnail`,
 * `length`, `link`, `views`, `uploaded`, `status`, `file_active` fields.
 */
export function parseVideoListResponse(payload: unknown): VidaraListResult {
  const result = ((payload as { result?: unknown } | null)?.result ?? {}) as Record<string, unknown>;
  const rawVideos = Array.isArray(result.videos) ? result.videos : [];

  const videos = rawVideos
    .map(parseVideoListEntry)
    .filter((entry): entry is VidaraVideoMeta => entry !== null);

  return {
    videos,
    total: toIntOrNull(result.total),
    page: toIntOrNull(result.page),
    perPage: toIntOrNull(result.per_page),
    totalPages: toIntOrNull(result.total_pages),
    results: toIntOrNull(result.results),
  };
}

function parseVideoListEntry(raw: unknown): VidaraVideoMeta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const rawFilecodeStr = toTrimmedString(record.filecode);
  const link = firstHttpUrl(record.link);
  const filecode =
    tryExtractVidaraFilecode(rawFilecodeStr) ?? tryExtractVidaraFilecode(link);
  if (!filecode) return null;

  const fileActive = toFileActive(record.file_active);
  const providerStatus = mapFileStatus(record.status, record.file_active);
  const isUnplayable = providerStatus === "blocked" || providerStatus === "error";
  const embedUrl = isUnplayable ? null : deriveInlinePlayerUrlFromProviderUrl(link, filecode);

  return {
    filecode,
    videoId: toIntOrNull(record.vid_id),
    title: toTrimmedString(record.title),
    thumbnailUrl: firstHttpUrl(record.thumbnail),
    playbackUrl: link,
    embedUrl,
    shareUrl: link,
    durationSeconds: toDuration(record.length),
    providerViews: toIntOrNull(record.views),
    providerCreatedAt: toTrimmedString(record.uploaded),
    fileActive,
    providerStatus,
  };
}

/**
 * Parser for direct multipart upload response (`POST {upload_server}`).
 * Documented shape: `{ url, title, video_id, filecode }`.
 * Always extracts the clean raw `filecode` and keeps `playbackUrl` and `embedUrl` separate.
 */
export function parseDirectUploadResponse(payload: unknown): VidaraDirectUploadResult | null {
  if (typeof payload !== "object" || payload === null) return null;
  const root = payload as Record<string, unknown>;
  const candidate =
    typeof root.filecode === "string"
      ? root
      : typeof root.result === "object" && root.result !== null
        ? (root.result as Record<string, unknown>)
        : typeof root.data === "object" && root.data !== null
          ? (root.data as Record<string, unknown>)
          : root;

  const url = firstHttpUrl(candidate.url ?? candidate.link);
  const filecode =
    tryExtractVidaraFilecode(toTrimmedString(candidate.filecode)) ??
    tryExtractVidaraFilecode(url);
  if (!filecode) return null;

  return {
    filecode,
    videoId: toIntOrNull(candidate.video_id ?? candidate.vid_id),
    title: toTrimmedString(candidate.title),
    url,
    playbackUrl: url,
    embedUrl: deriveInlinePlayerUrlFromProviderUrl(url, filecode),
  };
}

/**
 * Parser for `/v1/upload/url` response (nests payload under `data`).
 */
export function parseUploadUrlResponse(
  payload: unknown,
): { filecode: string; title: string | null; sizeBytes: number | null } | null {
  const envelope = (payload ?? {}) as Record<string, unknown>;
  const data = (envelope.data ?? envelope.result ?? {}) as Record<string, unknown>;
  const filecode = tryExtractVidaraFilecode(toTrimmedString(data.filecode));
  if (!filecode) return null;
  return {
    filecode,
    title: toTrimmedString(data.title),
    sizeBytes: toIntOrNull(data.size),
  };
}

/** Validates filename extension + MIME type against Vidara's supported video formats. */
export function validateVideoUploadFile(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  maxBytes: number;
}): { ok: true; sanitizedFilename: string; extension: string } | { ok: false; error: string } {
  const rawName = input.filename.trim();
  const baseName = rawName.split(/[/\\]/).pop() ?? "";
  const sanitized = baseName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 180);
  if (!sanitized) {
    return { ok: false, error: "A valid video filename is required." };
  }

  const dotIdx = sanitized.lastIndexOf(".");
  const extension = dotIdx >= 0 ? sanitized.slice(dotIdx).toLowerCase() : "";
  if (!extension || !ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      error: `Unsupported video format (${extension || "unknown"}). Accepted formats: ${[...ALLOWED_VIDEO_EXTENSIONS].join(", ")}.`,
    };
  }

  const mime = input.mimeType.trim().toLowerCase().split(";")[0];
  const isVideoMime =
    mime === "" ||
    mime === "application/octet-stream" ||
    ALLOWED_VIDEO_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  if (!isVideoMime) {
    return {
      ok: false,
      error: `Invalid MIME type "${mime}". Only video files are allowed.`,
    };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: "Video file appears to be empty (Content-Length must be > 0)." };
  }
  if (input.sizeBytes > input.maxBytes) {
    const maxMb = Math.round(input.maxBytes / (1024 * 1024));
    return {
      ok: false,
      error: `File exceeds the configured upload limit of ${maxMb} MB.`,
    };
  }

  return { ok: true, sanitizedFilename: sanitized, extension };
}
