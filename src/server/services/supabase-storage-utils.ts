/**
 * Pure Supabase Storage helpers, Free-plan quota enforcement, path validation,
 * and signed TUS endpoint builders. Zero runtime side-effects so every rule
 * can be unit-tested standalone without external credentials.
 */

/** Supabase Free global per-file upload cap (cannot be bypassed by bucket config). */
export const SUPABASE_FREE_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

/** Supabase Free total storage cap (1 GB) and conservative safety thresholds. */
export const SUPABASE_FREE_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB
export const SUPABASE_FREE_STORAGE_WARN_BYTES = 800 * 1024 * 1024; // 800 MB warning
export const SUPABASE_FREE_STORAGE_STOP_BYTES = 950 * 1024 * 1024; // 950 MB hard stop
export const SUPABASE_FREE_EGRESS_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB egress notice

/** Supabase documented fixed chunk size for TUS resumable uploads (6 MiB). */
export const SUPABASE_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

/** Maximum size for generated thumbnails uploaded to Supabase Storage. */
export const MAX_THUMBNAIL_BYTES = 512 * 1024; // 512 KB

export const DEFAULT_SUPABASE_BUCKET = "vibeplay-media";

export const ALLOWED_VIDEO_MIME = "video/mp4" as const;
export const ALLOWED_THUMBNAIL_MIMES = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedThumbnailMime = (typeof ALLOWED_THUMBNAIL_MIMES)[number];

const SAFE_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;
const SAFE_OBJECT_PATH_PATTERN = /^(videos|thumbnails)\/[a-z0-9-]{8,64}\/[a-z0-9_-]{8,64}\.(mp4|webp|jpg|jpeg|png)$/i;

/**
 * Builds the official Supabase direct Storage TUS endpoint for presigned uploads:
 *   https://<project-ref>.storage.supabase.co/storage/v1/upload/resumable/sign
 *
 * Per Supabase's official resumable upload documentation and Storage server source,
 * presigned uploads using `x-signature` MUST target `/storage/v1/upload/resumable/sign`
 * on the direct `.storage.supabase.co` hostname (never the plain JWT-authenticated
 * `/upload/resumable` route).
 */
export function buildSupabaseResumableSignedEndpoint(supabaseUrl: string): string {
  const parsed = new URL(supabaseUrl.trim());
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an HTTP or HTTPS URL.");
  }

  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".storage.supabase.co")) {
    return `${parsed.origin}/storage/v1/upload/resumable/sign`;
  }
  if (host.endsWith(".supabase.co")) {
    const ref = host.slice(0, -".supabase.co".length);
    if (!ref || ref.includes(".")) {
      throw new Error("Invalid Supabase project URL hostname.");
    }
    return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable/sign`;
  }

  // Self-hosted or local mock test server fallback on the same origin.
  return `${parsed.origin}/storage/v1/upload/resumable/sign`;
}

/** Builds the canonical public object URL for a file in a public Supabase Storage bucket. */
export function buildSupabasePublicObjectUrl(
  supabaseUrl: string,
  bucket: string,
  objectPath: string,
): string {
  const parsed = new URL(supabaseUrl.trim());
  const cleanBucket = bucket.trim().replace(/^\/+|\/+$/g, "");
  const cleanPath = objectPath
    .trim()
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${parsed.origin}/storage/v1/object/public/${encodeURIComponent(cleanBucket)}/${cleanPath}`;
}

/** Generates a collision-resistant server-side video object path (never trusts client paths). */
export function buildVideoObjectPath(videoId: string, randomId: string): string {
  if (!SAFE_ID_PATTERN.test(videoId) || !SAFE_ID_PATTERN.test(randomId)) {
    throw new Error("Invalid identifier for video storage path.");
  }
  return `videos/${videoId}/${randomId}.mp4`;
}

/** Generates a collision-resistant server-side thumbnail object path. */
export function buildThumbnailObjectPath(
  videoId: string,
  randomId: string,
  contentType: AllowedThumbnailMime,
): string {
  if (!SAFE_ID_PATTERN.test(videoId) || !SAFE_ID_PATTERN.test(randomId)) {
    throw new Error("Invalid identifier for thumbnail storage path.");
  }
  const ext =
    contentType === "image/webp" ? "webp" : contentType === "image/png" ? "png" : "jpg";
  return `thumbnails/${videoId}/${randomId}.${ext}`;
}

/** Validates a storage object path strictly before signing, verifying, or deleting. */
export function assertSafeStorageObjectPath(
  objectPath: string,
  expectedPrefix?: "videos/" | "thumbnails/",
): string {
  const trimmed = objectPath.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/") || trimmed.includes("\\")) {
    throw new Error("Invalid storage object path.");
  }
  if (!SAFE_OBJECT_PATH_PATTERN.test(trimmed)) {
    throw new Error("Storage object path does not match the required VibePlay naming policy.");
  }
  if (expectedPrefix && !trimmed.startsWith(expectedPrefix)) {
    throw new Error(`Storage object path must start with "${expectedPrefix}".`);
  }
  return trimmed;
}

export interface VideoValidationInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  maxFileBytes?: number;
}

/**
 * Validates that a selected video is a browser-compatible MP4 within the
 * Supabase Free 50 MB per-file upload limit.
 */
export function validateSupabaseVideoFile(
  input: VideoValidationInput,
): { ok: true; sanitizedFilename: string } | { ok: false; status: number; error: string } {
  const maxBytes = Math.min(
    input.maxFileBytes ?? SUPABASE_FREE_MAX_FILE_BYTES,
    SUPABASE_FREE_MAX_FILE_BYTES,
  );

  const rawName = input.filename.trim();
  const baseName = rawName.split(/[/\\]/).pop() ?? "";
  const sanitized = baseName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 180);
  if (!sanitized) {
    return { ok: false, status: 400, error: "A valid MP4 filename is required." };
  }

  const ext = sanitized.includes(".") ? sanitized.slice(sanitized.lastIndexOf(".")).toLowerCase() : "";
  if (ext !== ".mp4") {
    return {
      ok: false,
      status: 400,
      error: `Only MP4 videos (H.264 video + AAC audio, .mp4) are accepted on this bucket. Received "${ext || "no extension"}".`,
    };
  }

  const mime = input.mimeType.trim().toLowerCase().split(";")[0];
  if (mime !== ALLOWED_VIDEO_MIME) {
    return {
      ok: false,
      status: 400,
      error: `Invalid MIME type "${mime || "unknown"}". Only "${ALLOWED_VIDEO_MIME}" is allowed.`,
    };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, status: 400, error: "The selected video file is empty." };
  }

  if (input.sizeBytes > maxBytes) {
    const actualMb = (input.sizeBytes / (1024 * 1024)).toFixed(1);
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    return {
      ok: false,
      status: 413,
      error: `File is ${actualMb} MB, which exceeds the Supabase Free ${limitMb} MB per-file upload limit. Compress it locally (e.g. HandBrake or FFmpeg H.264/AAC) below ${limitMb} MB before uploading.`,
    };
  }

  return { ok: true, sanitizedFilename: sanitized };
}

export function validateSupabaseThumbnailFile(input: {
  mimeType: string;
  sizeBytes: number;
}): { ok: true; mimeType: AllowedThumbnailMime } | { ok: false; status: number; error: string } {
  const mime = input.mimeType.trim().toLowerCase().split(";")[0] as AllowedThumbnailMime;
  if (!ALLOWED_THUMBNAIL_MIMES.includes(mime)) {
    return {
      ok: false,
      status: 400,
      error: `Unsupported thumbnail MIME type "${mime}". Allowed: image/webp, image/jpeg, image/png.`,
    };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, status: 400, error: "Thumbnail image is empty." };
  }
  if (input.sizeBytes > MAX_THUMBNAIL_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Thumbnail exceeds the 512 KB maximum size.",
    };
  }
  return { ok: true, mimeType: mime };
}

export interface StorageQuotaEvaluation {
  allowed: boolean;
  warning: boolean;
  usedBytes: number;
  projectedBytes: number;
  quotaBytes: number;
  warnThresholdBytes: number;
  stopThresholdBytes: number;
  remainingBeforeStopBytes: number;
  percentOfFreeQuota: number;
  message: string | null;
}

/**
 * Evaluates current + incoming storage against Supabase Free 1 GB quota,
 * 800 MB warning threshold, and configurable safe stop threshold (default 950 MB).
 */
export function evaluateStorageQuota(
  usedBytes: number,
  incomingBytes: number,
  options?: { warnBytes?: number; stopBytes?: number; quotaBytes?: number },
): StorageQuotaEvaluation {
  const quotaBytes = options?.quotaBytes ?? SUPABASE_FREE_STORAGE_QUOTA_BYTES;
  const warnThresholdBytes = options?.warnBytes ?? SUPABASE_FREE_STORAGE_WARN_BYTES;
  const stopThresholdBytes = Math.min(
    options?.stopBytes ?? SUPABASE_FREE_STORAGE_STOP_BYTES,
    quotaBytes,
  );

  const safeUsed = Math.max(0, usedBytes);
  const safeIncoming = Math.max(0, incomingBytes);
  const projectedBytes = safeUsed + safeIncoming;
  const remainingBeforeStopBytes = Math.max(0, stopThresholdBytes - safeUsed);
  const percentOfFreeQuota = Math.min(100, Math.round((safeUsed / quotaBytes) * 1000) / 10);

  if (projectedBytes > stopThresholdBytes) {
    const usedMb = (safeUsed / (1024 * 1024)).toFixed(1);
    const stopMb = Math.round(stopThresholdBytes / (1024 * 1024));
    return {
      allowed: false,
      warning: true,
      usedBytes: safeUsed,
      projectedBytes,
      quotaBytes,
      warnThresholdBytes,
      stopThresholdBytes,
      remainingBeforeStopBytes,
      percentOfFreeQuota,
      message: `Upload blocked by Free-plan storage protection: ${usedMb} MB is already used and this upload would exceed the ${stopMb} MB safe limit (Supabase Free quota is 1 GB). Delete older videos before uploading more.`,
    };
  }

  const warning = projectedBytes >= warnThresholdBytes;
  const message = warning
    ? `Storage warning: ${(projectedBytes / (1024 * 1024)).toFixed(1)} MB of 1,024 MB Free-plan storage will be used after this upload.`
    : null;

  return {
    allowed: true,
    warning,
    usedBytes: safeUsed,
    projectedBytes,
    quotaBytes,
    warnThresholdBytes,
    stopThresholdBytes,
    remainingBeforeStopBytes,
    percentOfFreeQuota,
    message,
  };
}
