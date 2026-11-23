/**
 * Safe MongoDB Vidara record repair CLI script.
 *
 * Inspects existing MongoDB records where:
 *  - provider = "vidara" (or unset)
 *  - OR filecode contains `http://`, `https://`, `/e/`, or `/v/`
 *
 * For each affected record:
 *  - Extracts the raw filecode via `extractVidaraFilecode`
 *  - Preserves original URL separately in `playbackUrl` and `embedUrl`
 *  - Verifies via `GET https://api.vidara.so/v1/video/info?api_key=...&filecode=<RAW>`
 *  - Updates active records to `providerStatus: "ready"`, `fileActive: true`
 *  - Preserves title, description, categories, custom MongoDB thumbnail, views, and publication settings
 *  - Distinguishes HTTP 401/403 API auth errors without marking videos missing
 *  - NEVER deletes records and NEVER creates duplicate records
 *
 * Usage:
 *   MONGODB_URI="..." MONGODB_DB_NAME=vibeplay VIDARA_API_KEY="..." \
 *     node --experimental-strip-types scripts/repair-vidara-records.ts
 */
import "dotenv/config";
import { MongoClient } from "mongodb";
import {
  classifyVidaraApiResponse,
  deriveInlinePlayerUrlFromProviderUrl,
  extractVidaraFilecode,
  inspectVidaraUrl,
  isCorruptedVidaraFilecode,
  parseFileInfoResponse,
} from "../src/server/services/vidara-parse.ts";

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB_NAME?.trim() || "vibeplay";
const apiKey = process.env.VIDARA_API_KEY?.trim();

if (!uri) {
  console.error("ERROR: MONGODB_URI is required.");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
await client.connect();

try {
  const db = client.db(dbName);
  const videos = db.collection("videos");

  const docs = await videos
    .find({
      $or: [
        { provider: "vidara" },
        { provider: { $exists: false } },
        { filecode: { $regex: /https?:\/\/|\/[ev]\//i } },
      ],
    })
    .toArray();

  console.log(`Inspecting ${docs.length} Vidara record(s) in ${dbName}.videos...\n`);

  for (const doc of docs) {
    const oldFilecode = String(doc.filecode ?? "");
    const corrupted = isCorruptedVidaraFilecode(oldFilecode);
    const inspected = corrupted ? inspectVidaraUrl(oldFilecode) : null;

    let rawCode: string;
    try {
      rawCode = extractVidaraFilecode(oldFilecode);
    } catch (err) {
      console.log(`- [${doc._id}] SKIP invalid filecode="${oldFilecode}": ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const conflict =
      rawCode !== oldFilecode
        ? await videos.findOne({ filecode: rawCode, _id: { $ne: doc._id } }, { projection: { _id: 1 } })
        : null;
    const canRename = rawCode !== oldFilecode && !conflict;

    const preservedPlaybackUrl =
      (doc.playbackUrl as string | null | undefined) ??
      (doc.shareUrl as string | null | undefined) ??
      inspected?.playbackUrl ??
      null;
    const preservedEmbedUrl =
      (doc.embedUrl as string | null | undefined) ??
      inspected?.embedUrl ??
      deriveInlinePlayerUrlFromProviderUrl(preservedPlaybackUrl, rawCode);

    const now = new Date();
    const updateSet: Record<string, unknown> = {
      provider: "vidara",
      playbackUrl: preservedPlaybackUrl,
      embedUrl: preservedEmbedUrl,
      shareUrl: (doc.shareUrl as string | null | undefined) ?? preservedPlaybackUrl,
      updatedAt: now,
    };
    if (canRename) updateSet.filecode = rawCode;

    if (!apiKey) {
      await videos.updateOne({ _id: doc._id }, { $set: updateSet });
      console.log(
        `- [${doc._id}] Normalized filecode "${oldFilecode}" -> "${canRename ? rawCode : oldFilecode}" (VIDARA_API_KEY not set; skipped live File Info check).`,
      );
      continue;
    }

    const url = new URL("https://api.vidara.so/v1/video/info");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("filecode", rawCode);

    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    const rawText = await resp.text();
    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      parsedJson = null;
    }

    const classified = classifyVidaraApiResponse({
      httpStatus: resp.status,
      body: parsedJson,
      rawText,
    });

    if (!classified.ok) {
      if (classified.code === "AUTH_ERROR") {
        // Keep video status untouched on HTTP 401/403; still fix corrupted filecode cleanly.
        await videos.updateOne({ _id: doc._id }, { $set: updateSet });
        console.error(`- [${doc._id}] ${rawCode}: ${classified.message}`);
      } else {
        updateSet.providerStatus = "error";
        updateSet.fileActive = false;
        updateSet.lastCheckedAt = now;
        await videos.updateOne({ _id: doc._id }, { $set: updateSet });
        console.error(`- [${doc._id}] ${rawCode}: ${classified.message}`);
      }
      continue;
    }

    const meta = parseFileInfoResponse(classified.envelope);
    if (!meta) {
      updateSet.providerStatus = "error";
      updateSet.fileActive = false;
      updateSet.lastCheckedAt = now;
      await videos.updateOne({ _id: doc._id }, { $set: updateSet });
      console.error(`- [${doc._id}] ${rawCode}: Vidara returned no readable video metadata.`);
      continue;
    }

    updateSet.providerVideoId = meta.videoId ?? doc.providerVideoId ?? null;
    updateSet.playbackUrl = meta.playbackUrl ?? preservedPlaybackUrl;
    updateSet.embedUrl = meta.embedUrl ?? preservedEmbedUrl;
    updateSet.shareUrl = meta.shareUrl ?? updateSet.playbackUrl;
    updateSet.fileActive = meta.fileActive;
    updateSet.providerStatus = meta.providerStatus;
    if (meta.durationSeconds !== null) updateSet.durationSeconds = meta.durationSeconds;
    if (meta.thumbnailUrl) {
      updateSet.providerThumbnailUrl = meta.thumbnailUrl;
      if (!doc.hasCustomThumbnail) updateSet.thumbnailUrl = meta.thumbnailUrl;
    }
    updateSet.lastCheckedAt = now;

    await videos.updateOne({ _id: doc._id }, { $set: updateSet });
    console.log(
      `- [${doc._id}] OK filecode="${canRename ? rawCode : oldFilecode}" status=${meta.providerStatus} active=${String(meta.fileActive)} embedUrl=${String(updateSet.embedUrl)}`,
    );
  }
} finally {
  await client.close();
}
