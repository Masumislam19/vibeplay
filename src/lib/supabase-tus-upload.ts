"use client";

import * as tus from "tus-js-client";

/**
 * Browser-side Supabase Storage signed resumable upload client using `tus-js-client`.
 *
 * Follows Supabase's official presigned resumable upload specification:
 *  - Targets the direct Storage hostname `/storage/v1/upload/resumable/sign`
 *  - Sends `x-signature` (the short-lived signed upload token minted server-side)
 *    and `apikey` (the public publishable key) exactly ONCE per request
 *  - Uses fixed 6 MiB chunks (`6 * 1024 * 1024`), automatic retries, and
 *    resume-from-previous-upload after network interruptions
 *  - Never touches or receives `SUPABASE_SECRET_KEY`
 */

export interface SignedTusUploadParams {
  file: Blob | File;
  endpoint: string;
  bucketName: string;
  objectName: string;
  contentType: string;
  token: string;
  publishableKey: string;
  chunkSizeBytes?: number;
  cacheControlSeconds?: number;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
}

export interface TusUploadController {
  promise: Promise<void>;
  cancel: () => Promise<void>;
}

const DEFAULT_CHUNK_SIZE = 6 * 1024 * 1024; // 6 MiB (required by Supabase Storage TUS)
const DEFAULT_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

export function startSignedTusUpload(params: SignedTusUploadParams): TusUploadController {
  let activeUpload: tus.Upload | null = null;
  let cancelled = false;
  let rejectPromise: ((err: Error) => void) | null = null;

  const promise = new Promise<void>((resolve, reject) => {
    rejectPromise = reject;

    const upload = new tus.Upload(params.file, {
      endpoint: params.endpoint,
      retryDelays: DEFAULT_RETRY_DELAYS,
      // Set `x-signature` and `apikey` once in `headers` (never duplicated in onBeforeRequest).
      headers: {
        "x-signature": params.token,
        apikey: params.publishableKey,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: params.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE,
      metadata: {
        bucketName: params.bucketName,
        objectName: params.objectName,
        contentType: params.contentType,
        cacheControl: String(params.cacheControlSeconds ?? 31536000),
      },
      onError(error) {
        if (cancelled) {
          reject(new Error("Upload cancelled."));
          return;
        }
        const message =
          error instanceof Error ? error.message : "Upload to Supabase Storage failed.";
        reject(new Error(message));
      },
      onProgress(bytesUploaded, bytesTotal) {
        if (!cancelled) {
          params.onProgress?.(bytesUploaded, bytesTotal);
        }
      },
      onSuccess() {
        resolve();
      },
    });

    activeUpload = upload;

    // Resume from an interrupted upload for the exact same file + object path if available.
    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (cancelled) return;
        const matching = previousUploads.find(
          (prev) =>
            prev.uploadUrl &&
            prev.metadata?.objectName === params.objectName &&
            prev.metadata?.bucketName === params.bucketName,
        );
        if (matching) {
          upload.resumeFromPreviousUpload(matching);
        }
        upload.start();
      })
      .catch(() => {
        if (!cancelled) upload.start();
      });
  });

  async function cancel() {
    cancelled = true;
    if (activeUpload) {
      try {
        await activeUpload.abort(true);
      } catch {
        /* ignore abort errors */
      }
    }
    rejectPromise?.(new Error("Upload cancelled."));
  }

  return { promise, cancel };
}
