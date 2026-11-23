/**
 * Vidara filecode extraction, response parser, HTTP 401/403 classification,
 * and upload validation regression tests — run with:
 *   node --experimental-strip-types scripts/test-vidara-parse.ts
 *
 * Fixtures are taken from the official API documentation (https://vidara.so/api)
 * and the exact reported filecode `9jWkXi1HtNhOS`.
 */
import {
  classifyVidaraApiResponse,
  deriveInlinePlayerUrlFromProviderUrl,
  extractVidaraFilecode,
  inspectVidaraUrl,
  isCorruptedVidaraFilecode,
  parseDirectUploadResponse,
  parseFileInfoResponse,
  parseUploadUrlResponse,
  parseVideoListResponse,
  resolveVerifiedInlinePlaybackUrl,
  validateVideoUploadFile,
} from "../src/server/services/vidara-parse.ts";

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

console.log("\n1. extractVidaraFilecode — exact reported bug & all supported URL formats");
check(
  "reported embed URL https://vidara.to/e/9jWkXi1HtNhOS -> 9jWkXi1HtNhOS",
  extractVidaraFilecode("https://vidara.to/e/9jWkXi1HtNhOS"),
  "9jWkXi1HtNhOS",
);
check(
  "vidara.so embed URL https://vidara.so/e/9jWkXi1HtNhOS -> 9jWkXi1HtNhOS",
  extractVidaraFilecode("https://vidara.so/e/9jWkXi1HtNhOS"),
  "9jWkXi1HtNhOS",
);
check(
  "vidara.so /v/ URL https://vidara.so/v/9jWkXi1HtNhOS -> 9jWkXi1HtNhOS",
  extractVidaraFilecode("https://vidara.so/v/9jWkXi1HtNhOS"),
  "9jWkXi1HtNhOS",
);
check(
  "vidara.to /v/ URL https://vidara.to/v/9jWkXi1HtNhOS -> 9jWkXi1HtNhOS",
  extractVidaraFilecode("https://vidara.to/v/9jWkXi1HtNhOS"),
  "9jWkXi1HtNhOS",
);
check(
  "standard vidara.so URL https://vidara.so/9jWkXi1HtNhOS -> 9jWkXi1HtNhOS",
  extractVidaraFilecode("https://vidara.so/9jWkXi1HtNhOS"),
  "9jWkXi1HtNhOS",
);
check(
  "standard vidara.to URL https://vidara.to/9jWkXi1HtNhOS -> 9jWkXi1HtNhOS",
  extractVidaraFilecode("https://vidara.to/9jWkXi1HtNhOS"),
  "9jWkXi1HtNhOS",
);
check(
  "raw filecode 9jWkXi1HtNhOS -> 9jWkXi1HtNhOS",
  extractVidaraFilecode("9jWkXi1HtNhOS"),
  "9jWkXi1HtNhOS",
);
check(
  "raw filecode with surrounding whitespace",
  extractVidaraFilecode("  9jWkXi1HtNhOS  "),
  "9jWkXi1HtNhOS",
);
check(
  "trailing slash on /e/ URL",
  extractVidaraFilecode("https://vidara.to/e/9jWkXi1HtNhOS/"),
  "9jWkXi1HtNhOS",
);
check(
  "multiple trailing slashes on /v/ URL",
  extractVidaraFilecode("https://vidara.so/v/9jWkXi1HtNhOS///"),
  "9jWkXi1HtNhOS",
);
check(
  "query string & hash fragment on /e/ URL",
  extractVidaraFilecode("https://vidara.to/e/9jWkXi1HtNhOS?poster=https://cdn.example/img.jpg&t=12#player"),
  "9jWkXi1HtNhOS",
);
check(
  "www subdomain https://www.vidara.to/e/9jWkXi1HtNhOS -> 9jWkXi1HtNhOS",
  extractVidaraFilecode("https://www.vidara.to/e/9jWkXi1HtNhOS"),
  "9jWkXi1HtNhOS",
);

console.log("\n2. extractVidaraFilecode — invalid domains, paths & malformed inputs rejected");
checkThrows("rejects unrelated domain example.com", () =>
  extractVidaraFilecode("https://example.com/e/9jWkXi1HtNhOS"),
);
checkThrows("rejects lookalike domain evilvidara.to", () =>
  extractVidaraFilecode("https://evilvidara.to/e/9jWkXi1HtNhOS"),
);
checkThrows("rejects suffix spoof domain vidara.so.attacker.com", () =>
  extractVidaraFilecode("https://vidara.so.attacker.com/e/9jWkXi1HtNhOS"),
);
checkThrows("rejects unsupported path prefix /d/", () =>
  extractVidaraFilecode("https://vidara.so/d/9jWkXi1HtNhOS"),
);
checkThrows("rejects nested API path /v1/video/info", () =>
  extractVidaraFilecode("https://vidara.so/v1/video/info"),
);
checkThrows("rejects root URL with no filecode", () =>
  extractVidaraFilecode("https://vidara.to/"),
);
checkThrows("rejects URL with embedded credentials", () =>
  extractVidaraFilecode("https://user:pass@vidara.to/e/9jWkXi1HtNhOS"),
);
checkThrows("rejects invalid raw filecode with spaces", () =>
  extractVidaraFilecode("bad code!!"),
);
checkThrows("rejects too-short filecode", () => extractVidaraFilecode("abc"));
checkThrows("rejects empty string", () => extractVidaraFilecode(""));

console.log("\n3. Corrupted filecode detection & clean field separation");
check(
  "detects https://vidara.to/e/9jWkXi1HtNhOS as corrupted filecode",
  isCorruptedVidaraFilecode("https://vidara.to/e/9jWkXi1HtNhOS"),
  true,
);
check("recognizes raw 9jWkXi1HtNhOS as clean filecode", isCorruptedVidaraFilecode("9jWkXi1HtNhOS"), false);
const separated = inspectVidaraUrl("https://vidara.to/e/9jWkXi1HtNhOS");
check("inspectVidaraUrl separates raw filecode", separated?.filecode, "9jWkXi1HtNhOS");
check("inspectVidaraUrl preserves canonical playbackUrl", separated?.playbackUrl, "https://vidara.to/v/9jWkXi1HtNhOS");
check("inspectVidaraUrl preserves embedUrl", separated?.embedUrl, "https://vidara.to/e/9jWkXi1HtNhOS");

console.log("\n4. HTTP 401 / 403 API error classification (never misclassified as missing video)");
const err403Json = classifyVidaraApiResponse({
  httpStatus: 200,
  body: { server_time: "2026-11-21 06:30:00", status: 403 },
  rawText: '{"server_time":"2026-11-21 06:30:00","status":403}',
});
check("JSON status:403 -> ok=false", err403Json.ok, false);
check("JSON status:403 -> code=AUTH_ERROR", err403Json.ok ? null : err403Json.code, "AUTH_ERROR");
check(
  "JSON status:403 -> message describes API authentication/permission error",
  !err403Json.ok && /authentication\/permission error \(HTTP 403\)/i.test(err403Json.message),
  true,
);

const err401Http = classifyVidaraApiResponse({
  httpStatus: 401,
  body: null,
  rawText: "Unauthorized",
});
check("HTTP 401 -> code=AUTH_ERROR", err401Http.ok ? null : err401Http.code, "AUTH_ERROR");

const errMissingKey = classifyVidaraApiResponse({
  httpStatus: 200,
  body: null,
  rawText: "missing api_key",
});
check("plain-text 'missing api_key' -> code=AUTH_ERROR", errMissingKey.ok ? null : errMissingKey.code, "AUTH_ERROR");

const err404 = classifyVidaraApiResponse({
  httpStatus: 404,
  body: { status: 404, msg: "Video not found" },
  rawText: '{"status":404,"msg":"Video not found"}',
});
check("HTTP 404 -> code=NOT_FOUND (distinct from AUTH_ERROR)", err404.ok ? null : err404.code, "NOT_FOUND");

console.log("\n5. /v1/video/info, /v1/video/list, direct upload & playback URL resolution");
const FILE_INFO_RESPONSE = {
  server_time: "2026-01-08 01:05:32",
  status: 200,
  result: [
    {
      player_img: "https://vidara.so/thumb.jpg",
      status: "active",
      filecode: "9jWkXi1HtNhOS",
      link: "https://vidara.so/9jWkXi1HtNhOS",
      video_length: "12",
      video_title: "Apple_and_mango_conversing_20261026095355",
      video_views: 1543,
      video_created: "2025-08-18",
      file_active: 1,
    },
  ],
};
const info = parseFileInfoResponse(FILE_INFO_RESPONSE);
check("info extracts raw filecode", info?.filecode, "9jWkXi1HtNhOS");
check("info separates playbackUrl", info?.playbackUrl, "https://vidara.so/9jWkXi1HtNhOS");
check("info separates embedUrl", info?.embedUrl, "https://vidara.so/e/9jWkXi1HtNhOS");
check("info separates thumbnailUrl", info?.thumbnailUrl, "https://vidara.so/thumb.jpg");
check("info maps active+file_active=1 -> ready", info?.providerStatus, "ready");
check("info keeps fileActive=true", info?.fileActive, true);

const FILE_LIST_RESPONSE = {
  msg: "OK",
  status: 200,
  result: {
    videos: [
      {
        vid_id: 123456,
        filecode: "9jWkXi1HtNhOS",
        title: "My Video",
        thumbnail: "https://vidara.so/thumb.jpg",
        length: "12",
        link: "https://vidara.so/9jWkXi1HtNhOS",
        views: 1543,
        uploaded: "2025-08-18",
        status: "active",
        file_active: 1,
      },
    ],
    results: 1,
    page: 1,
    per_page: 100,
    total_pages: 9,
    total: 847,
  },
};
const list = parseVideoListResponse(FILE_LIST_RESPONSE);
check("list parses 1 video", list.videos.length, 1);
check("list keeps raw filecode", list.videos[0]?.filecode, "9jWkXi1HtNhOS");
check("list separates embedUrl", list.videos[0]?.embedUrl, "https://vidara.so/e/9jWkXi1HtNhOS");

const direct = parseDirectUploadResponse({
  url: "https://vidara.so/v/9jWkXi1HtNhOS",
  title: "video.mp4",
  video_id: 2494951,
  filecode: "9jWkXi1HtNhOS",
});
check("direct upload keeps raw filecode", direct?.filecode, "9jWkXi1HtNhOS");
check("direct upload keeps playbackUrl", direct?.playbackUrl, "https://vidara.so/v/9jWkXi1HtNhOS");
check("direct upload sets embedUrl on exact host", direct?.embedUrl, "https://vidara.so/e/9jWkXi1HtNhOS");

check(
  "deriveInlinePlayerUrlFromProviderUrl preserves vidara.to host for /e/ URL",
  deriveInlinePlayerUrlFromProviderUrl("https://vidara.to/e/9jWkXi1HtNhOS", "9jWkXi1HtNhOS"),
  "https://vidara.to/e/9jWkXi1HtNhOS",
);
check(
  "resolveVerifiedInlinePlaybackUrl uses embedUrl directly for active video",
  resolveVerifiedInlinePlaybackUrl({
    filecode: "9jWkXi1HtNhOS",
    embedUrl: "https://vidara.to/e/9jWkXi1HtNhOS",
    playbackUrl: "https://vidara.to/v/9jWkXi1HtNhOS",
    providerStatus: "ready",
    fileActive: true,
  }),
  "https://vidara.to/e/9jWkXi1HtNhOS",
);
check(
  "resolveVerifiedInlinePlaybackUrl recovers gracefully from legacy corrupted filecode URL",
  resolveVerifiedInlinePlaybackUrl({
    filecode: "https://vidara.to/e/9jWkXi1HtNhOS",
    embedUrl: null,
    playbackUrl: null,
    providerStatus: "ready",
    fileActive: null,
  }),
  "https://vidara.to/e/9jWkXi1HtNhOS",
);
check(
  "resolveVerifiedInlinePlaybackUrl returns null for missing URL on bare filecode",
  resolveVerifiedInlinePlaybackUrl({
    filecode: "9jWkXi1HtNhOS",
    embedUrl: null,
    playbackUrl: null,
    providerStatus: "ready",
  }),
  null,
);
check(
  "resolveVerifiedInlinePlaybackUrl blocks inactive files",
  resolveVerifiedInlinePlaybackUrl({
    filecode: "9jWkXi1HtNhOS",
    embedUrl: "https://vidara.to/e/9jWkXi1HtNhOS",
    providerStatus: "ready",
    fileActive: false,
  }),
  null,
);

const uploaded = parseUploadUrlResponse({
  status: 200,
  data: { filecode: "9jWkXi1HtNhOS", title: "video", size: 52428800 },
});
check("/v1/upload/url extracts raw filecode", uploaded?.filecode, "9jWkXi1HtNhOS");

check(
  "upload validation accepts MP4",
  validateVideoUploadFile({ filename: "clip.mp4", mimeType: "video/mp4", sizeBytes: 1024, maxBytes: 10_000 }).ok,
  true,
);
check(
  "upload validation rejects non-video extension",
  validateVideoUploadFile({ filename: "x.exe", mimeType: "application/octet-stream", sizeBytes: 1024, maxBytes: 10_000 }).ok,
  false,
);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
