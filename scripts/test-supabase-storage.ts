/**
 * Supabase Storage helper, Free-plan quota, signed TUS protocol (6 MiB chunks,
 * x-signature, apikey, progress, cancellation, byte integrity), and HTTP
 * byte-range playback verification tests.
 *
 * Run with:
 *   node --experimental-strip-types scripts/test-supabase-storage.ts
 */
import crypto from "node:crypto";
import http from "node:http";
import * as tus from "tus-js-client";
import {
  assertSafeStorageObjectPath,
  buildSupabasePublicObjectUrl,
  buildSupabaseResumableSignedEndpoint,
  buildThumbnailObjectPath,
  buildVideoObjectPath,
  evaluateStorageQuota,
  SUPABASE_FREE_MAX_FILE_BYTES,
  SUPABASE_TUS_CHUNK_SIZE_BYTES,
  validateSupabaseThumbnailFile,
  validateSupabaseVideoFile,
} from "../src/server/services/supabase-storage-utils.ts";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.error(
      `  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`,
    );
  }
}

function checkThrows(label: string, fn: () => unknown): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  check(label, threw, true);
}

console.log("\n1. Supabase Storage URL & direct TUS /sign endpoint builders");
check(
  "direct storage TUS /sign endpoint for vibeplay-media project",
  buildSupabaseResumableSignedEndpoint("https://qgmeydlcvyggavtftmyz.supabase.co"),
  "https://qgmeydlcvyggavtftmyz.storage.supabase.co/storage/v1/upload/resumable/sign",
);
check(
  "direct storage TUS /sign endpoint with trailing slash",
  buildSupabaseResumableSignedEndpoint("https://qgmeydlcvyggavtftmyz.supabase.co/"),
  "https://qgmeydlcvyggavtftmyz.storage.supabase.co/storage/v1/upload/resumable/sign",
);
check(
  "public object URL builder",
  buildSupabasePublicObjectUrl(
    "https://qgmeydlcvyggavtftmyz.supabase.co",
    "vibeplay-media",
    "videos/abc12345/deadbeef.mp4",
  ),
  "https://qgmeydlcvyggavtftmyz.supabase.co/storage/v1/object/public/vibeplay-media/videos/abc12345/deadbeef.mp4",
);
check("TUS chunk size is 6 MiB", SUPABASE_TUS_CHUNK_SIZE_BYTES, 6 * 1024 * 1024);

console.log("\n2. Server-generated storage paths & path security validation");
const vidPath = buildVideoObjectPath("550e8400-e29b-41d4-a716-446655440000", "a1b2c3d4e5f60708");
check("video object path pattern", vidPath, "videos/550e8400-e29b-41d4-a716-446655440000/a1b2c3d4e5f60708.mp4");
check("assertSafeStorageObjectPath accepts valid video path", assertSafeStorageObjectPath(vidPath, "videos/"), vidPath);
const thumbPath = buildThumbnailObjectPath("550e8400-e29b-41d4-a716-446655440000", "a1b2c3d4e5f60708", "image/webp");
check("thumbnail object path pattern", thumbPath, "thumbnails/550e8400-e29b-41d4-a716-446655440000/a1b2c3d4e5f60708.webp");
check("assertSafeStorageObjectPath accepts valid thumbnail path", assertSafeStorageObjectPath(thumbPath, "thumbnails/"), thumbPath);
checkThrows("rejects path traversal ..", () => assertSafeStorageObjectPath("videos/../etc/passwd.mp4", "videos/"));
checkThrows("rejects leading slash", () => assertSafeStorageObjectPath("/videos/12345678/abcdef12.mp4", "videos/"));
checkThrows("rejects wrong prefix", () => assertSafeStorageObjectPath(thumbPath, "videos/"));
checkThrows("rejects executable extension", () => assertSafeStorageObjectPath("videos/12345678/abcdef12.exe", "videos/"));

console.log("\n3. Supabase Free 50 MB file-size & format validation");
check(
  "accepts 8 MB MP4",
  validateSupabaseVideoFile({ filename: "clip.mp4", mimeType: "video/mp4", sizeBytes: 8 * 1024 * 1024 }).ok,
  true,
);
check(
  "accepts exact 50 MB MP4",
  validateSupabaseVideoFile({ filename: "exact50.mp4", mimeType: "video/mp4", sizeBytes: SUPABASE_FREE_MAX_FILE_BYTES }).ok,
  true,
);
const over50 = validateSupabaseVideoFile({
  filename: "large67mb.mp4",
  mimeType: "video/mp4",
  sizeBytes: 67 * 1024 * 1024,
});
check("rejects 67 MB MP4 (> 50 MB Free limit)", over50.ok, false);
check("67 MB rejection status is 413", over50.ok ? 200 : over50.status, 413);
check("67 MB rejection includes compression hint", !over50.ok && /compress/i.test(over50.error), true);
check(
  "rejects non-MP4 extension (.mkv)",
  validateSupabaseVideoFile({ filename: "movie.mkv", mimeType: "video/x-matroska", sizeBytes: 5 * 1024 * 1024 }).ok,
  false,
);
check(
  "rejects spoofed MIME type on .mp4 filename",
  validateSupabaseVideoFile({ filename: "payload.mp4", mimeType: "application/x-msdownload", sizeBytes: 1024 }).ok,
  false,
);
check(
  "accepts valid WebP thumbnail (120 KB)",
  validateSupabaseThumbnailFile({ mimeType: "image/webp", sizeBytes: 120 * 1024 }).ok,
  true,
);
check(
  "rejects oversized thumbnail (800 KB)",
  validateSupabaseThumbnailFile({ mimeType: "image/jpeg", sizeBytes: 800 * 1024 }).ok,
  false,
);
check(
  "rejects SVG thumbnail (XSS risk)",
  validateSupabaseThumbnailFile({ mimeType: "image/svg+xml", sizeBytes: 1024 }).ok,
  false,
);

console.log("\n4. Supabase Free 1 GB quota protection (800 MB warn, 950 MB stop)");
const okQuota = evaluateStorageQuota(100 * 1024 * 1024, 10 * 1024 * 1024);
check("100 MB + 10 MB -> allowed, no warning", { allowed: okQuota.allowed, warning: okQuota.warning }, { allowed: true, warning: false });
const warnQuota = evaluateStorageQuota(795 * 1024 * 1024, 10 * 1024 * 1024);
check("795 MB + 10 MB -> allowed WITH 800 MB warning", { allowed: warnQuota.allowed, warning: warnQuota.warning }, { allowed: true, warning: true });
const stopQuota = evaluateStorageQuota(945 * 1024 * 1024, 10 * 1024 * 1024);
check("945 MB + 10 MB -> blocked at 950 MB safe stop", stopQuota.allowed, false);

console.log("\n5. TUS signed resumable upload protocol & HTTP 206 byte-range verification (local mock)");
const videoPayload = crypto.randomBytes(7 * 1024 * 1024 + 12345); // > 6 MiB to prove multi-chunk PATCH!
const expectedSha256 = crypto.createHash("sha256").update(videoPayload).digest("hex");
const signedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ2aWJlIn0.mock_sig";
const pubKey = "sb_publishable_test_key";

const storedBuffers = new Map<string, Buffer>();
let sawCreatePostPath = "";
let sawSignatureHeader = "";
let sawApiKeyHeader = "";
let sawMetadataHeader = "";
let patchCount = 0;

const mockStorage = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (req.method === "POST" && url === "/storage/v1/upload/resumable/sign") {
    sawCreatePostPath = url;
    sawSignatureHeader = String(req.headers["x-signature"] ?? "");
    sawApiKeyHeader = String(req.headers["apikey"] ?? "");
    sawMetadataHeader = String(req.headers["upload-metadata"] ?? "");

    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const id = crypto.randomBytes(6).toString("hex");
      const body = Buffer.concat(chunks);
      storedBuffers.set(id, body);
      res.writeHead(201, {
        Location: `/storage/v1/upload/resumable/sign/${id}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(body.length),
      });
      res.end();
    });
    return;
  }

  if (req.method === "PATCH" && url.startsWith("/storage/v1/upload/resumable/sign/")) {
    patchCount += 1;
    const id = url.split("/").pop() ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const existing = storedBuffers.get(id) ?? Buffer.alloc(0);
      const next = Buffer.concat([existing, ...chunks]);
      storedBuffers.set(id, next);
      res.writeHead(204, {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(next.length),
      });
      res.end();
    });
    return;
  }

  if (req.method === "DELETE" && url.startsWith("/storage/v1/upload/resumable/sign/")) {
    const id = url.split("/").pop() ?? "";
    storedBuffers.delete(id);
    res.writeHead(204, { "Tus-Resumable": "1.0.0" });
    res.end();
    return;
  }

  if (req.method === "GET" && url.startsWith("/storage/v1/object/public/vibeplay-media/")) {
    const firstStored = [...storedBuffers.values()][0] ?? Buffer.alloc(0);
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = match ? Number.parseInt(match[1], 10) : 0;
      const end = match && match[2] ? Number.parseInt(match[2], 10) : firstStored.length - 1;
      const slice = firstStored.subarray(start, end + 1);
      res.writeHead(206, {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${firstStored.length}`,
        "Content-Length": String(slice.length),
      });
      res.end(slice);
      return;
    }
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": String(firstStored.length),
    });
    res.end(firstStored);
    return;
  }

  res.writeHead(404);
  res.end();
});

await new Promise<void>((resolve) => mockStorage.listen(0, "127.0.0.1", () => resolve()));
const addr = mockStorage.address();
const port = typeof addr === "object" && addr ? addr.port : 0;
const mockBase = `http://127.0.0.1:${port}`;
const endpoint = buildSupabaseResumableSignedEndpoint(mockBase);

try {
  let progressEvents = 0;
  let lastUploaded = 0;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(videoPayload, {
      endpoint,
      retryDelays: [0, 500],
      headers: {
        "x-signature": signedToken,
        apikey: pubKey,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: SUPABASE_TUS_CHUNK_SIZE_BYTES,
      metadata: {
        bucketName: "vibeplay-media",
        objectName: vidPath,
        contentType: "video/mp4",
        cacheControl: "31536000",
      },
      onProgress(uploaded) {
        progressEvents += 1;
        lastUploaded = uploaded;
      },
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  const received = [...storedBuffers.values()][0] ?? Buffer.alloc(0);
  const receivedSha256 = crypto.createHash("sha256").update(received).digest("hex");

  check("TUS POST hit /storage/v1/upload/resumable/sign", sawCreatePostPath, "/storage/v1/upload/resumable/sign");
  check("x-signature sent once verbatim (no duplicated JWS)", sawSignatureHeader, signedToken);
  check("publishable apikey header sent", sawApiKeyHeader, pubKey);
  check("Upload-Metadata includes bucketName & objectName", sawMetadataHeader.includes("bucketName") && sawMetadataHeader.includes("objectName"), true);
  check("7+ MiB file sent multiple chunks (POST + PATCH)", patchCount >= 1, true);
  check("progress callback fired and reached total size", progressEvents >= 2 && lastUploaded === videoPayload.length, true);
  check("assembled uploaded file SHA-256 matches original byte-for-byte", receivedSha256, expectedSha256);

  // Verify HTTP 206 Partial Content byte-range seeking
  const publicUrl = buildSupabasePublicObjectUrl(mockBase, "vibeplay-media", vidPath);
  const rangeRes = await fetch(publicUrl, { headers: { Range: "bytes=0-1023" } });
  const rangeBuf = Buffer.from(await rangeRes.arrayBuffer());
  check("HTTP byte-range request returns 206 Partial Content", rangeRes.status, 206);
  check("HTTP byte-range returns exact 1024 bytes", rangeBuf.length, 1024);
  check("HTTP byte-range bytes match original file prefix", rangeBuf.equals(videoPayload.subarray(0, 1024)), true);
} finally {
  mockStorage.close();
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
