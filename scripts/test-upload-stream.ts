/**
 * Streaming upload pipeline verification — tests Node.js native Readable
 * multipart streaming, exact Content-Length, byte-counting progress, zero-loss
 * byte integrity, abort cancellation, and size-limit enforcement against a
 * local mock Vidara upload server.
 *
 * Usage:
 *   node --experimental-strip-types scripts/test-upload-stream.ts
 */
import crypto from "node:crypto";
import http from "node:http";
import { Readable } from "node:stream";
import { postMultipartVideoStream } from "../src/server/services/vidara-stream.ts";
import { parseDirectUploadResponse } from "../src/server/services/vidara-parse.ts";

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

// Create a synthetic 2 MB binary payload with known SHA-256 hash.
const payload = crypto.randomBytes(2 * 1024 * 1024);
const expectedHash = crypto.createHash("sha256").update(payload).digest("hex");

let lastContentLength = 0;
let lastRawBody = Buffer.alloc(0);

const mockServer = http.createServer((req, res) => {
  lastContentLength = Number.parseInt(req.headers["content-length"] ?? "0", 10);
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    lastRawBody = Buffer.concat(chunks);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        url: "https://vidara.so/v/MockCode99",
        title: "sample.mp4",
        video_id: 987654,
        filecode: "MockCode99",
      }),
    );
  });
});

await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", () => resolve()));
const addr = mockServer.address();
const port = typeof addr === "object" && addr ? addr.port : 0;
const mockUrl = `http://127.0.0.1:${port}/api/upload`;

try {
  console.log("\n1. Streaming 2 MB video with exact Content-Length & progress callbacks");
  const chunkSize = 64 * 1024;
  async function* chunkedStream() {
    for (let offset = 0; offset < payload.length; offset += chunkSize) {
      yield payload.subarray(offset, Math.min(offset + chunkSize, payload.length));
    }
  }

  let progressEvents = 0;
  let lastTransferred = 0;
  const rawOutcome = await postMultipartVideoStream({
    targetUrl: mockUrl,
    apiKey: "test_key_never_logged",
    keyFields: ["api_key", "key"],
    fileStream: Readable.from(chunkedStream()),
    filename: "sample.mp4",
    contentType: "video/mp4",
    fileSizeBytes: payload.length,
    maxBytes: 10 * 1024 * 1024,
    onProgress: (transferred) => {
      progressEvents += 1;
      lastTransferred = transferred;
    },
  });
  const parsedUpload = parseDirectUploadResponse(rawOutcome.parsedJson);

  check("exact Content-Length matches received bytes", lastContentLength, lastRawBody.length);
  check("exact file bytes transferred", rawOutcome.bytesTransferred, payload.length);
  check("incremental progress callbacks fired", progressEvents >= 16, true);
  check("final progress equals payload size", lastTransferred, payload.length);
  check("parsed returned filecode", parsedUpload?.filecode, "MockCode99");
  check("parsed exact returned playbackUrl", parsedUpload?.playbackUrl, "https://vidara.so/v/MockCode99");
  check("derived inline embedUrl on vidara.so", parsedUpload?.embedUrl, "https://vidara.so/e/MockCode99");

  // Extract raw file bytes between the file part headers and closing boundary.
  const marker = Buffer.from('name="file"; filename="sample.mp4"\r\nContent-Type: video/mp4\r\n\r\n');
  const startIdx = lastRawBody.indexOf(marker) + marker.length;
  const receivedFile = lastRawBody.subarray(startIdx, startIdx + payload.length);
  const receivedHash = crypto.createHash("sha256").update(receivedFile).digest("hex");
  check("streamed file SHA-256 matches original byte-for-byte", receivedHash, expectedHash);
  check(
    "multipart preamble includes api_key field",
    lastRawBody.includes(Buffer.from('name="api_key"')),
    true,
  );
  check(
    "multipart preamble includes key field (covers Vidara docs discrepancy)",
    lastRawBody.includes(Buffer.from('name="key"')),
    true,
  );

  console.log("\n2. Abort cancellation stops stream cleanly");
  const ac = new AbortController();
  let abortedCaught = false;
  async function* slowStream() {
    yield Buffer.alloc(16 * 1024, 1);
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await new Promise((r) => setTimeout(r, 200));
    yield Buffer.alloc(16 * 1024, 2);
  }
  try {
    await postMultipartVideoStream({
      targetUrl: mockUrl,
      apiKey: "test_key",
      keyFields: ["api_key", "key"],
      fileStream: Readable.from(slowStream()),
      filename: "cancel.mp4",
      contentType: "video/mp4",
      fileSizeBytes: 32 * 1024,
      maxBytes: 1024 * 1024,
      signal: ac.signal,
    });
  } catch (err) {
    abortedCaught = err instanceof Error && /cancel/i.test(err.message);
  }
  check("AbortController cancels upstream streaming upload", abortedCaught, true);

  console.log("\n3. Hard byte-limit enforcement inside Transform stream");
  let limitCaught = false;
  try {
    await postMultipartVideoStream({
      targetUrl: mockUrl,
      apiKey: "test_key",
      keyFields: ["api_key", "key"],
      fileStream: Readable.from([Buffer.alloc(200 * 1024, 7)]),
      filename: "toobig.mp4",
      contentType: "video/mp4",
      fileSizeBytes: 200 * 1024,
      maxBytes: 100 * 1024,
    });
  } catch (err) {
    limitCaught = err instanceof Error && /exceeded maximum/i.test(err.message);
  }
  check("stream exceeding maxBytes is rejected mid-stream", limitCaught, true);
} finally {
  mockServer.close();
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
