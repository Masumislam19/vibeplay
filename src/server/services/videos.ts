import "server-only";
import crypto from "node:crypto";
import type { Filter, Sort } from "mongodb";
import {
  getCollections,
  slugify,
  type CategoryDocument,
  type StorageProvider,
  type VideoDocument,
} from "@/db";
import { HttpError } from "@/server/lib/http";
import { AUTHORIZED_OWNER_EMAIL, recordAudit } from "@/server/services/auth";
import {
  createSignedUploadGrant,
  deleteStorageObjects,
  getSafeStopStorageBytes,
  getSupabaseBucket,
  isSupabaseStorageConfigured,
  verifyUploadedObject,
  type SignedUploadGrant,
} from "@/server/services/supabase-storage";
import {
  buildThumbnailObjectPath,
  buildVideoObjectPath,
  evaluateStorageQuota,
  SUPABASE_FREE_STORAGE_QUOTA_BYTES,
  SUPABASE_FREE_STORAGE_WARN_BYTES,
  validateSupabaseThumbnailFile,
  validateSupabaseVideoFile,
  type StorageQuotaEvaluation,
} from "@/server/services/supabase-storage-utils";

/**
 * VibePlay video catalog & Supabase Storage lifecycle service backed by MongoDB Atlas.
 *
 * - Media files (MP4 videos & generated WebP/JPEG thumbnails) live ONLY in Supabase Storage.
 * - Metadata, upload sessions, categories, views, and reports live in MongoDB Atlas.
 * - Existing pre-migration MongoDB records are preserved untouched and surfaced as
 *   `storageProvider: "legacy"` (with zero broken playback URLs) until replaced in-place.
 */

export type SortOption = "latest" | "oldest" | "views" | "featured";

export interface VideoListItem {
  id: string;
  storageProvider: StorageProvider;
  legacyProvider: string | null;
  supabaseBucket: string | null;
  videoObjectPath: string | null;
  videoUrl: string | null;
  thumbnailObjectPath: string | null;
  thumbnailUrl: string | null;
  title: string;
  description: string | null;
  categoryId: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  published: boolean;
  featured: boolean;
  ageRestricted: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
  categoryName: string | null;
  categorySlug: string | null;
}

/** Public-safe projection: never exposes draft object paths or internal storage details. */
export interface PublicVideoItem {
  id: string;
  storageProvider: StorageProvider;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  published: boolean;
  featured: boolean;
  ageRestricted: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
  categoryName: string | null;
  categorySlug: string | null;
}

export function toPublicVideo(video: VideoListItem): PublicVideoItem {
  return {
    id: video.id,
    storageProvider: video.storageProvider,
    videoUrl: video.published && video.storageProvider === "supabase" ? video.videoUrl : null,
    thumbnailUrl: video.published ? video.thumbnailUrl : null,
    title: video.title,
    description: video.description,
    durationSeconds: video.durationSeconds,
    width: video.width,
    height: video.height,
    published: video.published,
    featured: video.featured,
    ageRestricted: video.ageRestricted,
    views: video.views,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    categoryName: video.categoryName,
    categorySlug: video.categorySlug,
  };
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMongoDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

function mapSort(sort: SortOption): Sort {
  switch (sort) {
    case "oldest":
      return { createdAt: 1 };
    case "views":
      return { views: -1, createdAt: -1 };
    case "featured":
      return { featured: -1, createdAt: -1 };
    case "latest":
    default:
      return { createdAt: -1 };
  }
}

function resolveStorageProvider(doc: VideoDocument): StorageProvider {
  if (doc.storageProvider === "supabase" && doc.videoObjectPath && doc.videoUrl) {
    return "supabase";
  }
  return "legacy";
}

function resolveEffectiveThumbnailUrl(doc: VideoDocument): string | null {
  if (doc.thumbnailObjectPath && doc.thumbnailUrl) {
    return doc.thumbnailUrl;
  }
  if (doc.hasCustomThumbnail) {
    const version = (doc.thumbnailUpdatedAt ?? doc.updatedAt).getTime();
    return `/api/videos/${encodeURIComponent(doc._id)}/thumbnail?v=${version}`;
  }
  // Never emit obsolete external provider URLs for legacy records.
  if (doc.storageProvider === "supabase" && doc.thumbnailUrl) {
    return doc.thumbnailUrl;
  }
  return null;
}

async function hydrateVideos(docs: VideoDocument[]): Promise<VideoListItem[]> {
  if (docs.length === 0) return [];
  const catIds = [
    ...new Set(docs.map((d) => d.categoryId).filter((id): id is string => Boolean(id))),
  ];
  const catMap = new Map<string, CategoryDocument>();
  if (catIds.length > 0) {
    const { categories } = await getCollections();
    const cats = await categories.find({ _id: { $in: catIds } }).toArray();
    for (const c of cats) catMap.set(c._id, c);
  }

  return docs.map((d) => {
    const cat = d.categoryId ? catMap.get(d.categoryId) : undefined;
    const storageProvider = resolveStorageProvider(d);
    const legacyProvider =
      storageProvider === "legacy" ? (d.legacyProvider ?? d.provider ?? "legacy") : null;

    return {
      id: d._id,
      storageProvider,
      legacyProvider,
      supabaseBucket: storageProvider === "supabase" ? (d.supabaseBucket ?? getSupabaseBucket()) : null,
      videoObjectPath: storageProvider === "supabase" ? (d.videoObjectPath ?? null) : null,
      videoUrl: storageProvider === "supabase" ? (d.videoUrl ?? null) : null,
      thumbnailObjectPath: d.thumbnailObjectPath ?? null,
      thumbnailUrl: resolveEffectiveThumbnailUrl(d),
      title: d.title,
      description: d.description,
      categoryId: d.categoryId,
      durationSeconds: d.durationSeconds ?? null,
      fileSizeBytes: d.fileSizeBytes ?? null,
      mimeType: d.mimeType ?? null,
      width: d.width ?? null,
      height: d.height ?? null,
      published: d.published,
      featured: d.featured,
      ageRestricted: d.ageRestricted,
      views: d.views,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      categoryName: cat?.name ?? null,
      categorySlug: cat?.slug ?? null,
    };
  });
}

export interface ListVideosOptions {
  q?: string;
  categorySlug?: string;
  sort?: SortOption;
  page?: number;
  limit?: number;
  publishedOnly?: boolean;
  featuredOnly?: boolean;
  storageFilter?: StorageProvider;
}

export interface ListVideosResult {
  videos: VideoListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listVideos(options: ListVideosOptions = {}): Promise<ListVideosResult> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(48, Math.max(1, options.limit ?? 12));
  const publishedOnly = options.publishedOnly ?? true;

  const { videos, categories } = await getCollections();
  const filter: Filter<VideoDocument> = {};

  if (publishedOnly) {
    filter.published = true;
    // Public catalog only shows playable Supabase-hosted videos (legacy unmigrated
    // records stay preserved in MongoDB & Admin without creating broken public links).
    filter.storageProvider = "supabase";
    filter.videoUrl = { $type: "string" };
  } else if (options.storageFilter === "supabase") {
    filter.storageProvider = "supabase";
  } else if (options.storageFilter === "legacy") {
    filter.storageProvider = { $ne: "supabase" };
  }

  if (options.featuredOnly) filter.featured = true;

  if (options.categorySlug) {
    const category = await categories.findOne({ slug: options.categorySlug });
    if (!category) {
      return { videos: [], total: 0, page, limit, totalPages: 1 };
    }
    filter.categoryId = category._id;
  }

  if (options.q?.trim()) {
    const regex = new RegExp(escapeRegex(options.q.trim()), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const [docs, total] = await Promise.all([
    videos
      .find(filter)
      .sort(mapSort(options.sort ?? "latest"))
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    videos.countDocuments(filter),
  ]);

  return {
    videos: await hydrateVideos(docs),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getVideoById(id: string, publishedOnly = true): Promise<VideoListItem | null> {
  const { videos } = await getCollections();
  const filter: Filter<VideoDocument> = { _id: id };
  if (publishedOnly) filter.published = true;
  const doc = await videos.findOne(filter);
  if (!doc) return null;
  const [hydrated] = await hydrateVideos([doc]);
  return hydrated ?? null;
}

export async function getRelatedVideos(video: VideoListItem, limit = 12): Promise<VideoListItem[]> {
  const { videos } = await getCollections();
  const baseFilter: Filter<VideoDocument> = {
    published: true,
    storageProvider: "supabase",
    videoUrl: { $type: "string" },
    _id: { $ne: video.id },
  };

  const sameCategoryDocs = video.categoryId
    ? await videos
        .find({ ...baseFilter, categoryId: video.categoryId })
        .sort({ views: -1, createdAt: -1 })
        .limit(limit)
        .toArray()
    : [];

  if (sameCategoryDocs.length >= Math.min(limit, 6)) {
    return hydrateVideos(sameCategoryDocs);
  }

  const excluded = [video.id, ...sameCategoryDocs.map((v) => v._id)];
  const remaining = limit - sameCategoryDocs.length;
  const fillDocs = await videos
    .find({ ...baseFilter, _id: { $nin: excluded } })
    .sort({ views: -1, createdAt: -1 })
    .limit(remaining)
    .toArray();

  return hydrateVideos([...sameCategoryDocs, ...fillDocs].slice(0, limit));
}

/** Trending: published Supabase videos ranked by views recorded in the last 7 days. */
export async function getTrendingVideos(limit = 12): Promise<VideoListItem[]> {
  const { videos, videoViews } = await getCollections();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentCounts = await videoViews
    .aggregate<{ _id: string; recentViews: number }>([
      { $match: { createdAt: { $gt: weekAgo } } },
      { $group: { _id: "$videoId", recentViews: { $sum: 1 } } },
      { $sort: { recentViews: -1 } },
      { $limit: limit * 2 },
    ])
    .toArray();

  const recentMap = new Map<string, number>();
  for (const row of recentCounts) recentMap.set(row._id, row.recentViews);

  const publicFilter: Filter<VideoDocument> = {
    published: true,
    storageProvider: "supabase",
    videoUrl: { $type: "string" },
  };

  const recentIds = recentCounts.map((r) => r._id);
  const recentDocs =
    recentIds.length > 0
      ? await videos.find({ ...publicFilter, _id: { $in: recentIds } }).toArray()
      : [];

  recentDocs.sort((a, b) => {
    const diff = (recentMap.get(b._id) ?? 0) - (recentMap.get(a._id) ?? 0);
    if (diff !== 0) return diff;
    return b.views - a.views;
  });

  if (recentDocs.length >= limit) {
    return hydrateVideos(recentDocs.slice(0, limit));
  }

  const have = recentDocs.map((d) => d._id);
  const fillDocs = await videos
    .find({ ...publicFilter, _id: { $nin: have } })
    .sort({ views: -1, createdAt: -1 })
    .limit(limit - recentDocs.length)
    .toArray();

  return hydrateVideos([...recentDocs, ...fillDocs]);
}

// ---------------------------------------------------------------------------
// Storage usage tracking (Supabase Free 1 GB quota guard)
// ---------------------------------------------------------------------------

export async function getTrackedSupabaseStorageUsage(): Promise<{
  usedBytes: number;
  videoBytes: number;
  thumbnailBytes: number;
  videoCount: number;
  quota: StorageQuotaEvaluation;
}> {
  const { videos } = await getCollections();
  const rows = await videos
    .aggregate<{ videoBytes: number; thumbnailBytes: number; count: number }>([
      { $match: { storageProvider: "supabase" } },
      {
        $group: {
          _id: null,
          videoBytes: { $sum: { $ifNull: ["$fileSizeBytes", 0] } },
          thumbnailBytes: { $sum: { $ifNull: ["$thumbnailSizeBytes", 0] } },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const videoBytes = rows[0]?.videoBytes ?? 0;
  const thumbnailBytes = rows[0]?.thumbnailBytes ?? 0;
  const usedBytes = videoBytes + thumbnailBytes;
  const quota = evaluateStorageQuota(usedBytes, 0, {
    quotaBytes: SUPABASE_FREE_STORAGE_QUOTA_BYTES,
    warnBytes: SUPABASE_FREE_STORAGE_WARN_BYTES,
    stopBytes: getSafeStopStorageBytes(),
  });

  return {
    usedBytes,
    videoBytes,
    thumbnailBytes,
    videoCount: rows[0]?.count ?? 0,
    quota,
  };
}

// ---------------------------------------------------------------------------
// Signed Direct-to-Supabase Upload Authorization & Completion
// ---------------------------------------------------------------------------

export interface AuthorizeUploadInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailMimeType?: string | null;
  thumbnailSizeBytes?: number | null;
  replaceVideoId?: string | null;
}

export interface AuthorizedUploadResponse {
  uploadSessionId: string;
  mode: "create" | "replace";
  videoId: string;
  bucket: string;
  resumableEndpoint: string;
  publishableKey: string;
  chunkSizeBytes: number;
  videoUpload: {
    objectPath: string;
    token: string;
    signedUrl: string;
    publicUrl: string;
    contentType: string;
  };
  thumbnailUpload: {
    objectPath: string;
    token: string;
    signedUrl: string;
    publicUrl: string;
    contentType: string;
  } | null;
  quota: StorageQuotaEvaluation;
}

/**
 * Step 1 of direct-to-Supabase upload:
 * - Validates file type (MP4 only), file size (<= 50 MB), optional thumbnail (<= 512 KB),
 *   and Free-plan storage quota (800 MB warning, safe stop at configured limit).
 * - Generates random collision-resistant object paths server-side (never trusts client paths).
 * - Mints short-lived signed upload tokens using `SUPABASE_SECRET_KEY`.
 * - Persists a 24h `upload_sessions` record in MongoDB so completion can verify exact paths.
 */
export async function authorizeSupabaseUpload(
  input: AuthorizeUploadInput,
  actor: { adminId: string; ip: string },
): Promise<AuthorizedUploadResponse> {
  if (!isSupabaseStorageConfigured()) {
    throw new HttpError(
      503,
      "Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY on the server.",
    );
  }

  const videoCheck = validateSupabaseVideoFile({
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  if (!videoCheck.ok) {
    throw new HttpError(videoCheck.status, videoCheck.error);
  }

  let validatedThumbMime: "image/webp" | "image/jpeg" | "image/png" | null = null;
  let validatedThumbSize: number | null = null;
  if (input.thumbnailMimeType && input.thumbnailSizeBytes) {
    const thumbCheck = validateSupabaseThumbnailFile({
      mimeType: input.thumbnailMimeType,
      sizeBytes: input.thumbnailSizeBytes,
    });
    if (!thumbCheck.ok) {
      throw new HttpError(thumbCheck.status, thumbCheck.error);
    }
    validatedThumbMime = thumbCheck.mimeType;
    validatedThumbSize = input.thumbnailSizeBytes;
  }

  const { videos, uploadSessions } = await getCollections();

  // If replacing an existing (legacy or Supabase) record, verify it exists first.
  let mode: "create" | "replace" = "create";
  let videoId: string = crypto.randomUUID();
  let replacedBytes = 0;

  if (input.replaceVideoId) {
    const existing = await videos.findOne({ _id: input.replaceVideoId });
    if (!existing) {
      throw new HttpError(404, "Target video to replace was not found.");
    }
    mode = "replace";
    videoId = existing._id;
    if (existing.storageProvider === "supabase") {
      replacedBytes = (existing.fileSizeBytes ?? 0) + (existing.thumbnailSizeBytes ?? 0);
    }
  }

  const usage = await getTrackedSupabaseStorageUsage();
  const netUsed = Math.max(0, usage.usedBytes - replacedBytes);
  const incomingBytes = input.sizeBytes + (validatedThumbSize ?? 0);
  const quota = evaluateStorageQuota(netUsed, incomingBytes, {
    quotaBytes: SUPABASE_FREE_STORAGE_QUOTA_BYTES,
    warnBytes: SUPABASE_FREE_STORAGE_WARN_BYTES,
    stopBytes: getSafeStopStorageBytes(),
  });

  if (!quota.allowed) {
    throw new HttpError(507, quota.message ?? "Free-plan storage threshold reached.");
  }

  const videoObjectPath = buildVideoObjectPath(videoId, crypto.randomBytes(8).toString("hex"));
  const videoGrant: SignedUploadGrant = await createSignedUploadGrant(videoObjectPath, "videos/");

  let thumbGrant: SignedUploadGrant | null = null;
  if (validatedThumbMime) {
    const thumbPath = buildThumbnailObjectPath(
      videoId,
      crypto.randomBytes(8).toString("hex"),
      validatedThumbMime,
    );
    thumbGrant = await createSignedUploadGrant(thumbPath, "thumbnails/");
  }

  const uploadSessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await uploadSessions.insertOne({
    _id: uploadSessionId,
    adminId: actor.adminId,
    mode,
    videoId,
    bucket: videoGrant.bucket,
    videoObjectPath: videoGrant.objectPath,
    videoPublicUrl: videoGrant.publicUrl,
    expectedVideoBytes: input.sizeBytes,
    expectedVideoMime: "video/mp4",
    originalFilename: videoCheck.sanitizedFilename,
    thumbnailObjectPath: thumbGrant?.objectPath ?? null,
    thumbnailPublicUrl: thumbGrant?.publicUrl ?? null,
    expectedThumbnailBytes: validatedThumbSize,
    expectedThumbnailMime: validatedThumbMime,
    status: "pending",
    createdAt: now,
    completedAt: null,
    expiresAt,
  });

  await recordAudit(
    "upload.authorized",
    actor.adminId,
    AUTHORIZED_OWNER_EMAIL,
    `Authorized ${mode} upload for ${videoCheck.sanitizedFilename} (${(input.sizeBytes / (1024 * 1024)).toFixed(2)} MB) -> ${videoGrant.objectPath}`,
    actor.ip,
  );

  return {
    uploadSessionId,
    mode,
    videoId,
    bucket: videoGrant.bucket,
    resumableEndpoint: videoGrant.resumableEndpoint,
    publishableKey: videoGrant.publishableKey,
    chunkSizeBytes: videoGrant.chunkSizeBytes,
    videoUpload: {
      objectPath: videoGrant.objectPath,
      token: videoGrant.token,
      signedUrl: videoGrant.signedUrl,
      publicUrl: videoGrant.publicUrl,
      contentType: "video/mp4",
    },
    thumbnailUpload:
      thumbGrant && validatedThumbMime
        ? {
            objectPath: thumbGrant.objectPath,
            token: thumbGrant.token,
            signedUrl: thumbGrant.signedUrl,
            publicUrl: thumbGrant.publicUrl,
            contentType: validatedThumbMime,
          }
        : null,
    quota,
  };
}

export interface CompleteUploadInput {
  uploadSessionId: string;
  title?: string;
  description?: string | null;
  categoryId?: string | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  ageRestricted?: boolean;
  published?: boolean;
  thumbnailUploaded?: boolean;
}

/**
 * Step 2 of direct-to-Supabase upload:
 * - Looks up the server-issued `upload_sessions` record (never trusts client paths).
 * - Verifies the uploaded MP4 actually exists in Supabase Storage (and checks byte-range support).
 * - Atomically marks the upload session completed to prevent duplicate records.
 * - Creates a new MongoDB video record OR replaces an existing legacy/Supabase record in place
 *   (preserving title, description, category, views, and metadata on replacement).
 */
export async function completeSupabaseUpload(
  input: CompleteUploadInput,
  actor: { adminId: string; ip: string },
): Promise<{ video: VideoListItem; supportsByteRanges: boolean }> {
  const { uploadSessions, videos, categories, videoThumbnails } = await getCollections();
  const session = await uploadSessions.findOne({ _id: input.uploadSessionId });

  if (!session) {
    throw new HttpError(404, "Upload session not found or expired. Please start a new upload.");
  }
  if (session.adminId !== actor.adminId) {
    throw new HttpError(403, "This upload session does not belong to the authenticated owner.");
  }
  if (session.status === "completed") {
    throw new HttpError(409, "This upload has already been finalized (duplicate request prevented).");
  }
  if (session.status === "cancelled") {
    throw new HttpError(409, "This upload session was cancelled.");
  }

  if (input.categoryId) {
    const cat = await categories.findOne({ _id: input.categoryId }, { projection: { _id: 1 } });
    if (!cat) throw new HttpError(400, "Selected category does not exist.");
  }

  // Verify the video file actually exists in Supabase Storage before saving to MongoDB.
  const verifiedVideo = await verifyUploadedObject(session.videoObjectPath, "videos/", true);
  if (!verifiedVideo.exists) {
    throw new HttpError(
      400,
      "The video file was not found in Supabase Storage. Please retry the upload.",
    );
  }

  let verifiedThumbUrl: string | null = null;
  let verifiedThumbPath: string | null = null;
  let verifiedThumbBytes: number | null = null;

  if (session.thumbnailObjectPath && input.thumbnailUploaded !== false) {
    const verifiedThumb = await verifyUploadedObject(
      session.thumbnailObjectPath,
      "thumbnails/",
      false,
    );
    if (verifiedThumb.exists) {
      verifiedThumbUrl = verifiedThumb.publicUrl;
      verifiedThumbPath = session.thumbnailObjectPath;
      verifiedThumbBytes = verifiedThumb.sizeBytes ?? session.expectedThumbnailBytes;
    }
  }

  // Atomically claim the upload session so concurrent/double clicks cannot create duplicates.
  const now = new Date();
  const claimed = await uploadSessions.findOneAndUpdate(
    { _id: session._id, status: "pending" },
    { $set: { status: "completed", completedAt: now } },
    { returnDocument: "after" },
  );
  if (!claimed) {
    throw new HttpError(409, "This upload was already completed by another request.");
  }

  const cleanDuration =
    typeof input.durationSeconds === "number" &&
    Number.isFinite(input.durationSeconds) &&
    input.durationSeconds > 0
      ? Math.round(input.durationSeconds)
      : null;
  const cleanWidth =
    typeof input.width === "number" && Number.isFinite(input.width) && input.width > 0
      ? Math.round(input.width)
      : null;
  const cleanHeight =
    typeof input.height === "number" && Number.isFinite(input.height) && input.height > 0
      ? Math.round(input.height)
      : null;
  const actualVideoBytes = verifiedVideo.sizeBytes ?? session.expectedVideoBytes;

  if (session.mode === "replace") {
    const existing = await videos.findOne({ _id: session.videoId });
    if (!existing) {
      throw new HttpError(404, "Target video no longer exists.");
    }

    const oldPathsToCleanup: string[] = [];
    if (
      existing.storageProvider === "supabase" &&
      existing.videoObjectPath &&
      existing.videoObjectPath !== session.videoObjectPath
    ) {
      oldPathsToCleanup.push(existing.videoObjectPath);
    }
    if (
      verifiedThumbPath &&
      existing.thumbnailObjectPath &&
      existing.thumbnailObjectPath !== verifiedThumbPath
    ) {
      oldPathsToCleanup.push(existing.thumbnailObjectPath);
    }

    const updateSet: Partial<VideoDocument> = {
      storageProvider: "supabase",
      legacyProvider: null,
      supabaseBucket: session.bucket,
      videoObjectPath: session.videoObjectPath,
      videoUrl: verifiedVideo.publicUrl,
      fileSizeBytes: actualVideoBytes,
      mimeType: "video/mp4",
      originalFilename: session.originalFilename,
      durationSeconds: cleanDuration ?? existing.durationSeconds,
      width: cleanWidth ?? existing.width ?? null,
      height: cleanHeight ?? existing.height ?? null,
      updatedAt: now,
    };

    if (input.title !== undefined && input.title.trim()) {
      updateSet.title = input.title.trim().slice(0, 300);
    }
    if (input.description !== undefined) {
      updateSet.description = input.description?.trim() || null;
    }
    if (input.categoryId !== undefined) {
      updateSet.categoryId = input.categoryId || null;
    }
    if (input.ageRestricted !== undefined) {
      updateSet.ageRestricted = input.ageRestricted;
    }
    if (input.published !== undefined) {
      updateSet.published = input.published;
    }
    if (verifiedThumbPath && verifiedThumbUrl) {
      updateSet.thumbnailObjectPath = verifiedThumbPath;
      updateSet.thumbnailUrl = verifiedThumbUrl;
      updateSet.thumbnailSizeBytes = verifiedThumbBytes;
      updateSet.thumbnailUpdatedAt = now;
      updateSet.hasCustomThumbnail = false;
    }

    await videos.updateOne({ _id: existing._id }, { $set: updateSet });

    // Best-effort cleanup of previous Supabase objects (never touches legacy external accounts).
    if (oldPathsToCleanup.length > 0) {
      await deleteStorageObjects(oldPathsToCleanup).catch(() => undefined);
    }
    if (verifiedThumbPath) {
      await videoThumbnails.deleteOne({ _id: existing._id }).catch(() => undefined);
    }

    await recordAudit(
      "video.replaced_supabase",
      actor.adminId,
      AUTHORIZED_OWNER_EMAIL,
      `Replaced media for "${existing.title}" (${existing._id}) with Supabase object ${session.videoObjectPath}`,
      actor.ip,
    );

    const updated = await getVideoById(existing._id, false);
    if (!updated) throw new HttpError(500, "Updated video could not be read back.");
    return { video: updated, supportsByteRanges: verifiedVideo.supportsByteRanges };
  }

  // Create new Supabase-backed video record.
  const cleanTitle = (
    input.title?.trim() ||
    session.originalFilename.replace(/\.[^.]+$/, "") ||
    "Untitled Video"
  ).slice(0, 300);

  try {
    await videos.insertOne({
      _id: session.videoId,
      storageProvider: "supabase",
      legacyProvider: null,
      supabaseBucket: session.bucket,
      videoObjectPath: session.videoObjectPath,
      videoUrl: verifiedVideo.publicUrl,
      thumbnailObjectPath: verifiedThumbPath,
      thumbnailUrl: verifiedThumbUrl,
      thumbnailSizeBytes: verifiedThumbBytes,
      thumbnailUpdatedAt: verifiedThumbPath ? now : null,
      hasCustomThumbnail: false,
      title: cleanTitle,
      description: input.description?.trim() || null,
      categoryId: input.categoryId || null,
      durationSeconds: cleanDuration,
      fileSizeBytes: actualVideoBytes,
      mimeType: "video/mp4",
      width: cleanWidth,
      height: cleanHeight,
      originalFilename: session.originalFilename,
      published: Boolean(input.published),
      featured: false,
      ageRestricted: Boolean(input.ageRestricted),
      views: 0,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (isMongoDuplicateKey(error)) {
      throw new HttpError(409, "A video record for this storage path already exists.");
    }
    throw error;
  }

  await recordAudit(
    "video.uploaded_supabase",
    actor.adminId,
    AUTHORIZED_OWNER_EMAIL,
    `Uploaded "${cleanTitle}" (${(actualVideoBytes / (1024 * 1024)).toFixed(2)} MB) to Supabase Storage`,
    actor.ip,
  );

  const created = await getVideoById(session.videoId, false);
  if (!created) throw new HttpError(500, "Video was saved but could not be read back.");
  return { video: created, supportsByteRanges: verifiedVideo.supportsByteRanges };
}

/** Cancels a pending upload session and cleans up any partial/orphan Supabase objects if present. */
export async function cancelSupabaseUpload(
  uploadSessionId: string,
  actor: { adminId: string; ip: string },
): Promise<void> {
  const { uploadSessions } = await getCollections();
  const session = await uploadSessions.findOne({ _id: uploadSessionId, adminId: actor.adminId });
  if (!session || session.status !== "pending") return;

  await uploadSessions.updateOne({ _id: session._id }, { $set: { status: "cancelled" } });

  if (isSupabaseStorageConfigured()) {
    await deleteStorageObjects([session.videoObjectPath, session.thumbnailObjectPath]).catch(
      () => undefined,
    );
  }
}

// ---------------------------------------------------------------------------
// Thumbnail serving helper (supports Supabase Storage + legacy MongoDB thumbnails)
// ---------------------------------------------------------------------------

export async function getVideoThumbnailForRequest(
  videoId: string,
  allowDrafts: boolean,
): Promise<
  | { kind: "redirect"; url: string }
  | { kind: "binary"; bytes: Buffer; contentType: string; etag: string; updatedAt: Date }
  | { kind: "none" }
> {
  const { videos, videoThumbnails } = await getCollections();
  const video = await videos.findOne({ _id: videoId });
  if (!video) return { kind: "none" };
  // Never expose draft thumbnails/paths to public visitors.
  if (!allowDrafts && !video.published) return { kind: "none" };

  if (video.thumbnailObjectPath && video.thumbnailUrl) {
    return { kind: "redirect", url: video.thumbnailUrl };
  }

  const legacyThumb = await videoThumbnails.findOne({ _id: videoId });
  if (legacyThumb?.data) {
    return {
      kind: "binary",
      bytes: Buffer.from(legacyThumb.data.buffer),
      contentType: legacyThumb.contentType,
      etag: legacyThumb.etag,
      updatedAt: legacyThumb.updatedAt,
    };
  }

  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Metadata Update & Delete (removes Supabase video + thumbnail + MongoDB record)
// ---------------------------------------------------------------------------

export interface UpdateVideoPatch {
  title?: string;
  description?: string | null;
  categoryId?: string | null;
  published?: boolean;
  featured?: boolean;
  ageRestricted?: boolean;
}

export async function updateVideo(
  id: string,
  patch: UpdateVideoPatch,
  actor: { adminId: string; ip: string } | null,
): Promise<VideoListItem> {
  const current = await getVideoById(id, false);
  if (!current) throw new HttpError(404, "Video not found.");

  const { videos, categories } = await getCollections();
  if (patch.categoryId) {
    const cat = await categories.findOne({ _id: patch.categoryId }, { projection: { _id: 1 } });
    if (!cat) throw new HttpError(400, "Selected category does not exist.");
  }

  if (patch.published === true && (current.storageProvider !== "supabase" || !current.videoUrl)) {
    throw new HttpError(
      409,
      "Legacy video cannot be published until its media file is replaced with an MP4 uploaded to Supabase Storage.",
    );
  }

  const set: Partial<VideoDocument> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 300) || current.title;
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId || null;
  if (patch.published !== undefined) set.published = patch.published;
  if (patch.featured !== undefined) set.featured = patch.featured;
  if (patch.ageRestricted !== undefined) set.ageRestricted = patch.ageRestricted;

  await videos.updateOne({ _id: id }, { $set: set });
  if (actor) {
    await recordAudit(
      "video.update",
      actor.adminId,
      AUTHORIZED_OWNER_EMAIL,
      `Updated video "${set.title ?? current.title}"`,
      actor.ip,
    );
  }
  const updated = await getVideoById(id, false);
  if (!updated) throw new HttpError(500, "Video disappeared during update.");
  return updated;
}

/**
 * Deletes a video safely:
 * 1. For Supabase-hosted videos, removes the video and thumbnail objects from
 *    Supabase Storage first so no orphan objects are left behind.
 * 2. Removes the MongoDB video document, local views, reports, and any legacy thumbnail.
 * Never deletes assets from any external legacy provider account.
 */
export async function deleteVideoAndMedia(
  id: string,
  actor: { adminId: string; ip: string },
): Promise<{ deletedStoragePaths: string[] }> {
  const { videos, videoThumbnails, videoViews, reports } = await getCollections();
  const doc = await videos.findOne({ _id: id });
  if (!doc) throw new HttpError(404, "Video not found.");

  const pathsToDelete: string[] = [];
  if (doc.storageProvider === "supabase" && doc.videoObjectPath) {
    pathsToDelete.push(doc.videoObjectPath);
  }
  if (doc.thumbnailObjectPath) {
    pathsToDelete.push(doc.thumbnailObjectPath);
  }

  let deletedStoragePaths: string[] = [];
  if (pathsToDelete.length > 0) {
    const removed = await deleteStorageObjects(pathsToDelete);
    deletedStoragePaths = removed.deleted;
  }

  await Promise.all([
    videos.deleteOne({ _id: id }),
    videoThumbnails.deleteOne({ _id: id }),
    videoViews.deleteMany({ videoId: id }),
    reports.deleteMany({ videoId: id }),
  ]);

  await recordAudit(
    "video.delete",
    actor.adminId,
    AUTHORIZED_OWNER_EMAIL,
    `Deleted "${doc.title}" (${deletedStoragePaths.length} Supabase object(s) removed)`,
    actor.ip,
  );

  return { deletedStoragePaths };
}

// ---------------------------------------------------------------------------
// Views (local analytics; atomic dedupe via unique index on {videoId, viewerHash})
// ---------------------------------------------------------------------------

export async function incrementView(
  videoId: string,
  viewerHash: string,
): Promise<{ videoFound: boolean; counted: boolean }> {
  const { videos, videoViews } = await getCollections();
  const exists = await videos.findOne(
    { _id: videoId, published: true },
    { projection: { _id: 1 } },
  );
  if (!exists) return { videoFound: false, counted: false };

  try {
    await videoViews.insertOne({
      _id: crypto.randomUUID(),
      videoId,
      viewerHash,
      createdAt: new Date(),
    });
  } catch (error) {
    if (isMongoDuplicateKey(error)) {
      return { videoFound: true, counted: false };
    }
    throw error;
  }

  await videos.updateOne({ _id: videoId }, { $inc: { views: 1 } });
  return { videoFound: true, counted: true };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function createReport(input: {
  videoId: string;
  reason: string;
  details?: string;
  contactEmail?: string;
}): Promise<void> {
  const video = await getVideoById(input.videoId, true);
  if (!video) throw new HttpError(404, "Video not found.");
  const { reports } = await getCollections();
  await reports.insertOne({
    _id: crypto.randomUUID(),
    videoId: input.videoId,
    reason: input.reason.slice(0, 120),
    details: input.details?.slice(0, 2000) || null,
    contactEmail: input.contactEmail?.slice(0, 255) || null,
    status: "open",
    createdAt: new Date(),
    resolvedAt: null,
  });
}

export interface AdminReport {
  id: string;
  videoId: string;
  videoTitle: string | null;
  videoThumbnail: string | null;
  videoPublished: boolean | null;
  reason: string;
  details: string | null;
  contactEmail: string | null;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

export async function listReports(options: { status?: string; page?: number; limit?: number } = {}): Promise<{
  reports: AdminReport[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const { reports, videos } = await getCollections();
  const filter = options.status ? { status: options.status as "open" | "resolved" | "dismissed" } : {};

  const [docs, total] = await Promise.all([
    reports
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    reports.countDocuments(filter),
  ]);

  const videoIds = [...new Set(docs.map((d) => d.videoId))];
  const videoDocs =
    videoIds.length > 0 ? await videos.find({ _id: { $in: videoIds } }).toArray() : [];
  const videoMap = new Map(videoDocs.map((v) => [v._id, v]));

  return {
    reports: docs.map((r) => {
      const v = videoMap.get(r.videoId);
      return {
        id: r._id,
        videoId: r.videoId,
        videoTitle: v?.title ?? null,
        videoThumbnail: v ? resolveEffectiveThumbnailUrl(v) : null,
        videoPublished: v ? v.published : null,
        reason: r.reason,
        details: r.details,
        contactEmail: r.contactEmail,
        status: r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function resolveReport(
  reportId: string,
  status: "resolved" | "dismissed",
  unpublishVideo: boolean,
  actor: { adminId: string; ip: string },
): Promise<void> {
  const { reports, videos } = await getCollections();
  const report = await reports.findOne({ _id: reportId });
  if (!report) throw new HttpError(404, "Report not found.");

  const now = new Date();
  await reports.updateOne({ _id: reportId }, { $set: { status, resolvedAt: now } });
  if (unpublishVideo) {
    await videos.updateOne({ _id: report.videoId }, { $set: { published: false, updatedAt: now } });
  }

  await recordAudit(
    "report.resolve",
    actor.adminId,
    AUTHORIZED_OWNER_EMAIL,
    `Report ${reportId.slice(0, 8)} ${status}${unpublishVideo ? " + video unpublished" : ""}`,
    actor.ip,
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  videoCount: number;
}

export async function listCategoriesWithCounts(publishedOnly = true): Promise<CategoryWithCount[]> {
  const { categories, videos } = await getCollections();
  const [catDocs, countRows] = await Promise.all([
    categories.find({}).sort({ name: 1 }).toArray(),
    videos
      .aggregate<{ _id: string | null; count: number }>([
        ...(publishedOnly
          ? [{ $match: { published: true, storageProvider: "supabase", videoUrl: { $type: "string" } } }]
          : []),
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const countMap = new Map<string, number>();
  for (const row of countRows) {
    if (row._id) countMap.set(row._id, row.count);
  }

  return catDocs.map((c) => ({
    id: c._id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    videoCount: countMap.get(c._id) ?? 0,
  }));
}

export async function createCategory(name: string, description: string | null): Promise<CategoryWithCount> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new HttpError(400, "Category name is required.");
  const slug = slugify(clean);
  if (!slug) throw new HttpError(400, "Category name must contain letters or numbers.");

  const { categories } = await getCollections();
  const id = crypto.randomUUID();
  const doc: CategoryDocument = {
    _id: id,
    name: clean,
    slug,
    description,
    createdAt: new Date(),
  };

  try {
    await categories.insertOne(doc);
  } catch (error) {
    if (isMongoDuplicateKey(error)) {
      throw new HttpError(409, "A category with that name already exists.");
    }
    throw error;
  }

  return { id, name: doc.name, slug: doc.slug, description: doc.description, videoCount: 0 };
}

export async function updateCategory(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  const { categories } = await getCollections();
  const existing = await categories.findOne({ _id: id }, { projection: { _id: 1 } });
  if (!existing) throw new HttpError(404, "Category not found.");

  const set: Partial<CategoryDocument> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 80);
    if (!clean) throw new HttpError(400, "Category name is required.");
    set.name = clean;
  }
  if (patch.description !== undefined) {
    set.description = patch.description?.trim() || null;
  }

  if (Object.keys(set).length === 0) return;
  try {
    await categories.updateOne({ _id: id }, { $set: set });
  } catch (error) {
    if (isMongoDuplicateKey(error)) {
      throw new HttpError(409, "A category with that name already exists.");
    }
    throw error;
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const { categories, videos } = await getCollections();
  const result = await categories.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw new HttpError(404, "Category not found.");
  await videos.updateMany({ categoryId: id }, { $set: { categoryId: null, updatedAt: new Date() } });
}

export async function listAllCategories(): Promise<Array<{ id: string; name: string; slug: string }>> {
  const { categories } = await getCollections();
  const docs = await categories.find({}).sort({ name: 1 }).toArray();
  return docs.map((c) => ({ id: c._id, name: c.name, slug: c.slug }));
}
