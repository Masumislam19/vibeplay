import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { Readable, Transform } from "node:stream";

/**
 * Pure Node.js native multipart/form-data streaming engine for Vidara uploads.
 *
 * - Never buffers the video file in RAM.
 * - Never writes video files to the local filesystem.
 * - Sends exact pre-computed `Content-Length` (preamble + fileBytes + epilogue).
 * - Uses native Node.js backpressure (`Readable.from` async generator -> `pipe`).
 * - Enforces hard byte limit mid-stream via a counting `Transform`.
 * - Propagates `AbortSignal` so browser cancellation immediately terminates
 *   the upstream Vidara request.
 */

export class StreamUploadError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "StreamUploadError";
  }
}

export interface MultipartStreamOptions {
  targetUrl: string;
  apiKey: string;
  keyFields: Array<"api_key" | "key">;
  fileStream: Readable;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  maxBytes: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (transferredBytes: number, totalBytes: number) => void;
}

export interface RawMultipartUploadResult {
  statusCode: number;
  rawBody: string;
  parsedJson: unknown;
  bytesTransferred: number;
  uploadServerHost: string;
}

export async function postMultipartVideoStream(
  options: MultipartStreamOptions,
): Promise<RawMultipartUploadResult> {
  const target = new URL(options.targetUrl);
  const boundary = `----VibePlayUpload${crypto.randomBytes(12).toString("hex")}`;
  const safeFilename = options.filename.replace(/["\r\n\\]/g, "_");
  const safeMime = (options.contentType || "application/octet-stream").replace(/[\r\n]/g, "");

  const preambleParts: string[] = [];
  for (const fieldName of options.keyFields) {
    preambleParts.push(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${fieldName}"\r\n\r\n` +
        `${options.apiKey}\r\n`,
    );
  }
  preambleParts.push(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeFilename}"\r\n` +
      `Content-Type: ${safeMime}\r\n\r\n`,
  );

  const preamble = Buffer.from(preambleParts.join(""), "utf8");
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const totalContentLength = preamble.length + options.fileSizeBytes + epilogue.length;

  let bytesTransferred = 0;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesTransferred += chunk.length;
      if (bytesTransferred > options.maxBytes) {
        callback(
          new StreamUploadError(
            413,
            `Upload aborted: file exceeded maximum allowed size (${Math.round(options.maxBytes / (1024 * 1024))} MB).`,
          ),
        );
        return;
      }
      if (bytesTransferred > options.fileSizeBytes) {
        callback(new StreamUploadError(400, "Upload stream exceeded the declared Content-Length."));
        return;
      }
      options.onProgress?.(bytesTransferred, options.fileSizeBytes);
      callback(null, chunk);
    },
  });

  async function* multipartGenerator() {
    yield preamble;
    options.fileStream.pipe(counter);
    for await (const chunk of counter) {
      yield chunk as Buffer;
    }
    if (bytesTransferred !== options.fileSizeBytes) {
      throw new StreamUploadError(
        400,
        `Upload ended early (${bytesTransferred} of ${options.fileSizeBytes} bytes received).`,
      );
    }
    yield epilogue;
  }

  const bodyStream = Readable.from(multipartGenerator());
  const transport = target.protocol === "https:" ? https : http;

  return new Promise<RawMultipartUploadResult>((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      options.fileStream.destroy();
      counter.destroy();
      bodyStream.destroy();
      req.destroy();
      reject(err);
    };

    const req = transport.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": String(totalContentLength),
          Accept: "application/json",
        },
        timeout: options.timeoutMs ?? 10 * 60 * 1000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let respBytes = 0;
        res.on("data", (c: Buffer) => {
          respBytes += c.length;
          if (respBytes <= 256 * 1024) chunks.push(c);
        });
        res.on("error", (err) => {
          fail(new StreamUploadError(502, `Error reading Vidara upload response: ${err.message}`));
        });
        res.on("end", () => {
          if (settled) return;
          const rawBody = Buffer.concat(chunks).toString("utf8").trim();
          let parsedJson: unknown = null;
          try {
            parsedJson = JSON.parse(rawBody);
          } catch {
            parsedJson = null;
          }
          settled = true;
          resolve({
            statusCode: res.statusCode ?? 502,
            rawBody,
            parsedJson,
            bytesTransferred,
            uploadServerHost: target.host,
          });
        });
      },
    );

    const onAbort = () => {
      fail(new StreamUploadError(499, "Upload was cancelled."));
    };
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    req.on("timeout", () => {
      fail(new StreamUploadError(504, "Vidara upload server timed out while receiving the video."));
    });
    req.on("error", (err) => {
      fail(new StreamUploadError(502, `Failed to stream video to Vidara: ${err.message}`));
    });
    bodyStream.on("error", (err) => {
      fail(err instanceof StreamUploadError ? err : new StreamUploadError(400, err.message));
    });
    options.fileStream.on("error", (err) => {
      fail(new StreamUploadError(400, `Upload stream interrupted: ${err.message}`));
    });

    bodyStream.pipe(req);
  });
}
