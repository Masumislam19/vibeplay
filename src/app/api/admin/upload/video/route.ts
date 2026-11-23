import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { handleRoute, HttpError, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import {
  getMaxUploadBytes,
  isVidaraConfigured,
  streamUploadToVidara,
} from "@/server/services/vidara";
import { validateVideoUploadFile } from "@/server/services/vidara-parse";
import { createUploadedVideoRecord } from "@/server/services/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeHeaderValue(raw: string | null): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/** Returns upload configuration (limit & Vidara readiness) for the authenticated owner. */
export async function GET() {
  return handleRoute(async () => {
    await requireAdminOrThrow();
    return jsonOk({
      maxUploadBytes: getMaxUploadBytes(),
      vidaraConfigured: isVidaraConfigured(),
    });
  });
}

/**
 * Authenticated streaming video upload endpoint.
 *
 * Receives the raw video binary stream directly in `req.body` (never calling
 * `req.formData()` or buffering the file in RAM or disk), streams it directly
 * to Vidara's active upload server (`GET /v1/upload/server` -> `POST <server>`)
 * with native backpressure, exact Content-Length, byte-counting, and abort
 * cancellation, then persists the Vidara filecode and returned metadata in MongoDB.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const ip = getClientIp(req);
    await enforceRateLimit("upload", ip, 10, 60 * 60 * 1000);

    if (!req.body) {
      throw new HttpError(400, "No video stream was received in the request body.");
    }

    const maxBytes = getMaxUploadBytes();
    const filename = decodeHeaderValue(req.headers.get("x-upload-filename"));
    const title = decodeHeaderValue(req.headers.get("x-upload-title"));
    const description = decodeHeaderValue(req.headers.get("x-upload-description"));
    const categoryId = decodeHeaderValue(req.headers.get("x-upload-category-id")) || null;
    const ageRestricted = req.headers.get("x-upload-age-restricted") === "1";
    const publishWhenReady = req.headers.get("x-upload-publish-when-ready") === "1";
    const durationRaw = Number.parseFloat(req.headers.get("x-upload-duration") ?? "");
    const durationSeconds =
      Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null;

    const contentType =
      req.headers.get("x-upload-mime")?.trim() ||
      req.headers.get("content-type")?.trim() ||
      "application/octet-stream";
    const declaredLength = Number.parseInt(
      req.headers.get("content-length") ?? req.headers.get("x-upload-size") ?? "",
      10,
    );

    const validation = validateVideoUploadFile({
      filename,
      mimeType: contentType,
      sizeBytes: declaredLength,
      maxBytes,
    });
    if (!validation.ok) {
      throw new HttpError(
        declaredLength > maxBytes ? 413 : 400,
        validation.error,
      );
    }

    // Convert Web ReadableStream -> Node.js Readable without buffering.
    const nodeFileStream = Readable.fromWeb(req.body as unknown as WebReadableStream<Uint8Array>);

    const outcome = await streamUploadToVidara({
      fileStream: nodeFileStream,
      filename: validation.sanitizedFilename,
      contentType,
      fileSizeBytes: declaredLength,
      maxBytes,
      signal: req.signal,
    });

    const video = await createUploadedVideoRecord(
      {
        upload: outcome.upload,
        title,
        description: description || null,
        categoryId,
        durationSeconds,
        ageRestricted,
        publishWhenReady,
        originalFilename: validation.sanitizedFilename,
        fileSizeBytes: outcome.bytesTransferred,
        mimeType: contentType,
      },
      { adminId: admin.id, ip },
    );

    return jsonOk(
      {
        video,
        bytesTransferred: outcome.bytesTransferred,
        providerResponse: {
          filecode: outcome.upload.filecode,
          videoId: outcome.upload.videoId,
          url: outcome.upload.url,
          playbackUrl: outcome.upload.playbackUrl,
          embedUrl: outcome.upload.embedUrl,
        },
      },
      201,
    );
  });
}
