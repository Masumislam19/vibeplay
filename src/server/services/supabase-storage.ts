import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/server/lib/http";
import {
  assertSafeStorageObjectPath,
  buildSupabasePublicObjectUrl,
  buildSupabaseResumableSignedEndpoint,
  DEFAULT_SUPABASE_BUCKET,
  SUPABASE_FREE_EGRESS_QUOTA_BYTES,
  SUPABASE_FREE_MAX_FILE_BYTES,
  SUPABASE_FREE_STORAGE_QUOTA_BYTES,
  SUPABASE_FREE_STORAGE_STOP_BYTES,
  SUPABASE_FREE_STORAGE_WARN_BYTES,
  SUPABASE_TUS_CHUNK_SIZE_BYTES,
} from "@/server/services/supabase-storage-utils";

/**
 * Server-only Supabase Storage integration.
 *
 * Security rules:
 * - Uses `SUPABASE_SECRET_KEY` ONLY on the server to mint short-lived signed
 *   upload tokens, verify uploaded objects, and delete objects on admin actions.
 * - `SUPABASE_SECRET_KEY` is NEVER exposed to browser bundles, logs, or responses.
 * - Browser receives ONLY `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the bucket name,
 *   the server-generated object path, the direct TUS `/sign` endpoint, and the
 *   short-lived signed token (`x-signature`).
 */

export class SupabaseStorageError extends HttpError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "SupabaseStorageError";
  }
}

export interface SupabaseStorageConfig {
  url: string;
  publishableKey: string;
  bucket: string;
  resumableEndpoint: string;
}

export function getSupabaseBucket(): string {
  return process.env.SUPABASE_BUCKET?.trim() || DEFAULT_SUPABASE_BUCKET;
}

export function getSafeStopStorageBytes(): number {
  const rawMb = Number.parseInt(process.env.SUPABASE_MAX_STORAGE_MB ?? "", 10);
  if (Number.isFinite(rawMb) && rawMb >= 100 && rawMb <= 1000) {
    return rawMb * 1024 * 1024;
  }
  return SUPABASE_FREE_STORAGE_STOP_BYTES;
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
      process.env.SUPABASE_SECRET_KEY?.trim(),
  );
}

export function getMissingSupabaseEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  if (!process.env.SUPABASE_SECRET_KEY?.trim()) missing.push("SUPABASE_SECRET_KEY");
  return missing;
}

function getConfigOrThrow(): SupabaseStorageConfig & { secretKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  const bucket = getSupabaseBucket();

  if (!url || !publishableKey || !secretKey) {
    const missing = getMissingSupabaseEnvVars();
    throw new SupabaseStorageError(
      503,
      `Supabase Storage is not fully configured on this server. Missing: ${missing.join(", ")}.`,
    );
  }

  return {
    url,
    publishableKey,
    secretKey,
    bucket,
    resumableEndpoint: buildSupabaseResumableSignedEndpoint(url),
  };
}

let cachedAdminClient: { key: string; client: SupabaseClient } | null = null;

function getAdminStorageClient(): {
  client: SupabaseClient;
  config: SupabaseStorageConfig;
} {
  const { secretKey, ...config } = getConfigOrThrow();
  const cacheKey = `${config.url}|${secretKey.slice(0, 8)}|${secretKey.length}`;

  if (!cachedAdminClient || cachedAdminClient.key !== cacheKey) {
    const client = createClient(config.url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    cachedAdminClient = { key: cacheKey, client };
  }

  return { client: cachedAdminClient.client, config };
}

export interface SignedUploadGrant {
  bucket: string;
  objectPath: string;
  token: string;
  signedUrl: string;
  publicUrl: string;
  resumableEndpoint: string;
  publishableKey: string;
  chunkSizeBytes: number;
}

/**
 * Mints a short-lived signed upload token for a single server-generated object
 * path using `SUPABASE_SECRET_KEY`. `upsert` is always `false` to prevent
 * overwriting or colliding with existing objects.
 */
export async function createSignedUploadGrant(
  objectPath: string,
  expectedPrefix: "videos/" | "thumbnails/",
): Promise<SignedUploadGrant> {
  const safePath = assertSafeStorageObjectPath(objectPath, expectedPrefix);
  const { client, config } = getAdminStorageClient();

  const { data, error } = await client.storage
    .from(config.bucket)
    .createSignedUploadUrl(safePath, { upsert: false });

  if (error || !data?.token || !data?.signedUrl) {
    throw new SupabaseStorageError(
      502,
      `Could not create Supabase signed upload token: ${error?.message || "unexpected empty response"}`,
    );
  }

  return {
    bucket: config.bucket,
    objectPath: safePath,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: buildSupabasePublicObjectUrl(config.url, config.bucket, safePath),
    resumableEndpoint: config.resumableEndpoint,
    publishableKey: config.publishableKey,
    chunkSizeBytes: SUPABASE_TUS_CHUNK_SIZE_BYTES,
  };
}

export interface VerifiedStorageObject {
  exists: boolean;
  publicUrl: string;
  sizeBytes: number | null;
  contentType: string | null;
  supportsByteRanges: boolean;
}

/**
 * Verifies that an uploaded object actually exists in the Supabase public bucket
 * and checks HTTP byte-range support (for HTML5 seeking on MP4 videos).
 */
export async function verifyUploadedObject(
  objectPath: string,
  expectedPrefix: "videos/" | "thumbnails/",
  checkByteRange = false,
): Promise<VerifiedStorageObject> {
  const safePath = assertSafeStorageObjectPath(objectPath, expectedPrefix);
  const { client, config } = getAdminStorageClient();
  const publicUrl = buildSupabasePublicObjectUrl(config.url, config.bucket, safePath);

  // 1. Primary server-side metadata lookup via Supabase Storage API (uses secret key).
  let sizeBytes: number | null = null;
  let contentType: string | null = null;
  let exists = false;

  const { data: infoData, error: infoError } = await client.storage
    .from(config.bucket)
    .info(safePath);

  if (!infoError && infoData) {
    exists = true;
    sizeBytes = typeof infoData.size === "number" ? infoData.size : null;
    contentType = typeof infoData.contentType === "string" ? infoData.contentType : null;
  } else {
    // 2. Fallback: HEAD request against the public object URL.
    try {
      const headRes = await fetch(publicUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(10_000),
      });
      if (headRes.ok) {
        exists = true;
        const len = Number.parseInt(headRes.headers.get("content-length") ?? "", 10);
        if (Number.isFinite(len) && len >= 0) sizeBytes = len;
        contentType = headRes.headers.get("content-type");
      }
    } catch {
      exists = false;
    }
  }

  if (!exists) {
    return {
      exists: false,
      publicUrl,
      sizeBytes: null,
      contentType: null,
      supportsByteRanges: false,
    };
  }

  let supportsByteRanges = false;
  if (checkByteRange) {
    try {
      const rangeRes = await fetch(publicUrl, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
        signal: AbortSignal.timeout(10_000),
      });
      // Drain small 2-byte body cleanly.
      await rangeRes.arrayBuffer().catch(() => undefined);
      const acceptRanges = rangeRes.headers.get("accept-ranges")?.toLowerCase() ?? "";
      supportsByteRanges = rangeRes.status === 206 || acceptRanges.includes("bytes");
    } catch {
      supportsByteRanges = false;
    }
  }

  return {
    exists: true,
    publicUrl,
    sizeBytes,
    contentType,
    supportsByteRanges,
  };
}

/**
 * Deletes one or more objects from Supabase Storage using `SUPABASE_SECRET_KEY`.
 * Validates every object path before issuing the remove call.
 */
export async function deleteStorageObjects(
  objectPaths: Array<string | null | undefined>,
): Promise<{ deleted: string[]; skipped: number }> {
  const validPaths: string[] = [];
  for (const raw of objectPaths) {
    if (!raw) continue;
    try {
      validPaths.push(assertSafeStorageObjectPath(raw));
    } catch {
      // Skip malformed/legacy paths safely.
    }
  }

  if (validPaths.length === 0) {
    return { deleted: [], skipped: objectPaths.length };
  }

  const { client, config } = getAdminStorageClient();
  const { error } = await client.storage.from(config.bucket).remove(validPaths);
  if (error) {
    throw new SupabaseStorageError(
      502,
      `Failed to delete object(s) from Supabase Storage: ${error.message}`,
    );
  }

  return { deleted: validPaths, skipped: objectPaths.length - validPaths.length };
}

export function getFreePlanLimitsSummary() {
  return {
    bucket: getSupabaseBucket(),
    projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null,
    configured: isSupabaseStorageConfigured(),
    missingEnvVars: getMissingSupabaseEnvVars(),
    maxFileBytes: SUPABASE_FREE_MAX_FILE_BYTES,
    chunkSizeBytes: SUPABASE_TUS_CHUNK_SIZE_BYTES,
    storageQuotaBytes: SUPABASE_FREE_STORAGE_QUOTA_BYTES,
    storageWarnBytes: SUPABASE_FREE_STORAGE_WARN_BYTES,
    storageStopBytes: getSafeStopStorageBytes(),
    egressQuotaBytes: SUPABASE_FREE_EGRESS_QUOTA_BYTES,
  };
}
