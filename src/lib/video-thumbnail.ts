"use client";

/**
 * Automatic client-side thumbnail generator from an actual local MP4 video frame.
 *
 * Loads the selected local File into a muted offscreen HTML `<video>` element,
 * reads its duration & natural dimensions, seeks to a representative non-black
 * frame, draws it to a resized `<canvas>` (max width 1280px), and exports
 * compressed WebP or JPEG strictly under 500 KB.
 *
 * If the browser cannot decode the video codec (e.g. non-H.264 MP4), throws an
 * honest error instead of generating a fake thumbnail.
 */

const MAX_WIDTH = 1280;
const MAX_THUMBNAIL_BYTES = 500 * 1024;
const DARK_LUMA_THRESHOLD = 14;
const LOAD_TIMEOUT_MS = 20_000;

export interface ExtractedThumbnail {
  blob: Blob;
  previewUrl: string;
  contentType: "image/webp" | "image/jpeg";
  byteLength: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
  durationSeconds: number | null;
  timestampSeconds: number;
}

/** Candidate relative positions cycled on "Regenerate Thumbnail" clicks. */
const REGENERATE_FRACTIONS = [0.15, 0.32, 0.5, 0.68, 0.82, 0.08];

function pickTimestamp(duration: number, attemptIndex: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (duration < 1.2) return Math.max(0, duration * 0.5);
  const fraction = REGENERATE_FRACTIONS[attemptIndex % REGENERATE_FRACTIONS.length];
  const raw = duration * fraction;
  if (attemptIndex === 0) {
    return Math.min(Math.max(raw, Math.min(1.5, duration * 0.25)), Math.min(15, duration - 0.25));
  }
  return Math.min(Math.max(raw, 0.2), Math.max(0.2, duration - 0.25));
}

function estimateFrameLuma(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  try {
    const sampleW = Math.min(width, 64);
    const sampleH = Math.min(height, 36);
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
    let total = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.7152 * 0 + 0.0722 * data[i + 2];
    }
    return pixels > 0 ? total / pixels : 255;
  } catch {
    return 255;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

async function encodeCompressedThumbnail(
  canvas: HTMLCanvasElement,
): Promise<{ blob: Blob; contentType: "image/webp" | "image/jpeg" }> {
  const qualities = [0.84, 0.72, 0.6, 0.48, 0.36];
  const testWebp = await canvasToBlob(canvas, "image/webp", 0.8);
  const formats: Array<"image/webp" | "image/jpeg"> =
    testWebp && testWebp.type === "image/webp" ? ["image/webp", "image/jpeg"] : ["image/jpeg"];

  let smallest: { blob: Blob; contentType: "image/webp" | "image/jpeg" } | null = null;
  for (const mime of formats) {
    for (const q of qualities) {
      const blob = await canvasToBlob(canvas, mime, q);
      if (!blob || blob.size === 0) continue;
      const actualType: "image/webp" | "image/jpeg" =
        blob.type === "image/webp" ? "image/webp" : "image/jpeg";
      if (!smallest || blob.size < smallest.blob.size) {
        smallest = { blob, contentType: actualType };
      }
      if (blob.size <= MAX_THUMBNAIL_BYTES) {
        return { blob, contentType: actualType };
      }
    }
  }

  if (smallest && smallest.blob.size <= MAX_THUMBNAIL_BYTES) {
    return smallest;
  }
  throw new Error("Could not compress the extracted video frame under 500 KB.");
}

function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while seeking a representative video frame."));
    }, LOAD_TIMEOUT_MS);

    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(
        new Error(
          "Your browser could not decode this video codec (re-encode to standard MP4 H.264 + AAC for universal browser playback).",
        ),
      );
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });

    try {
      video.currentTime = seconds;
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error("Could not seek video."));
    }
  });
}

function loadVideoMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out reading video metadata in the browser."));
    }, LOAD_TIMEOUT_MS);

    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(
        new Error(
          "Your browser cannot decode this video codec locally. Because VibePlay plays MP4 files directly in HTML5 <video>, please export your video as standard MP4 (H.264 video + AAC audio).",
        ),
      );
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

/**
 * Extracts a representative thumbnail frame from a local video `File`.
 * Increment `attemptIndex` on each "Regenerate Thumbnail" click to pick a new
 * timestamp across the video.
 */
export async function extractThumbnailFromVideoFile(
  file: File,
  attemptIndex = 0,
): Promise<ExtractedThumbnail> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = objectUrl;

  try {
    await loadVideoMetadata(video);

    const naturalW = video.videoWidth;
    const naturalH = video.videoHeight;
    if (!naturalW || !naturalH) {
      throw new Error(
        "No decodable browser video track was detected (for example HEVC/H.265 in an unsupported browser). Convert to MP4 H.264 + AAC for reliable playback and thumbnail capture.",
      );
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const scale = naturalW > MAX_WIDTH ? MAX_WIDTH / naturalW : 1;
    const targetW = Math.max(2, Math.round(naturalW * scale));
    const targetH = Math.max(2, Math.round(naturalH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Canvas 2D context is unavailable in this browser.");
    }

    const candidateIndices = attemptIndex === 0 ? [0, 1, 2] : [attemptIndex];
    let chosenTimestamp = 0;

    for (let i = 0; i < candidateIndices.length; i += 1) {
      const ts = pickTimestamp(duration, candidateIndices[i]);
      if (duration > 0) {
        await seekVideo(video, ts);
      }
      ctx.drawImage(video, 0, 0, targetW, targetH);
      chosenTimestamp = ts;
      const luma = estimateFrameLuma(ctx, targetW, targetH);
      if (luma >= DARK_LUMA_THRESHOLD || i === candidateIndices.length - 1) {
        break;
      }
    }

    const { blob, contentType } = await encodeCompressedThumbnail(canvas);
    const previewUrl = URL.createObjectURL(blob);

    return {
      blob,
      previewUrl,
      contentType,
      byteLength: blob.size,
      width: targetW,
      height: targetH,
      videoWidth: naturalW,
      videoHeight: naturalH,
      durationSeconds: duration > 0 ? Math.round(duration) : null,
      timestampSeconds: Math.round(chosenTimestamp * 10) / 10,
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
