import type { Binary, Collection, Db } from "mongodb";

/**
 * VibePlay MongoDB Atlas collection schemas and index definitions.
 *
 * Media binaries (MP4 videos and generated WebP/JPEG thumbnails) are stored
 * in Supabase Storage (`vibeplay-media`). MongoDB Atlas remains the primary
 * database for all video metadata, upload sessions, categories, views,
 * reports, site settings, single-owner credentials, sessions, audit logs,
 * and durable rate-limit counters.
 */

export type StorageProvider = "supabase" | "legacy";
export type ReportStatus = "open" | "resolved" | "dismissed";
export type UploadSessionStatus = "pending" | "completed" | "cancelled";

export interface AdminDocument {
  _id: string;
  email: string;
  passwordHash: string;
  /** Always 1 with a UNIQUE index so MongoDB itself enforces a single owner. */
  ownerSlot: 1;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminSessionDocument {
  _id: string;
  adminId: string;
  email: string;
  tokenHash: string;
  ip: string | null;
  userAgent: string | null;
  /** TTL index removes expired sessions automatically. */
  expiresAt: Date;
  createdAt: Date;
}

export interface CategoryDocument {
  _id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
}

export interface VideoDocument {
  _id: string;
  /** "supabase" for active Supabase Storage videos; "legacy" for pre-migration records. */
  storageProvider?: StorageProvider;
  /** Optional historical label preserved for unmigrated records (never used for runtime calls). */
  legacyProvider?: string | null;
  /** Supabase Storage bucket name (e.g. "vibeplay-media"). */
  supabaseBucket?: string | null;
  /** Supabase Storage object path (e.g. "videos/{videoId}/{randomId}.mp4"). */
  videoObjectPath?: string | null;
  /** Public Supabase Storage URL for native HTML5 playback. */
  videoUrl?: string | null;
  /** Supabase Storage object path for the auto-generated thumbnail. */
  thumbnailObjectPath?: string | null;
  /** Public Supabase Storage thumbnail URL (or legacy MongoDB thumbnail URL). */
  thumbnailUrl: string | null;
  /** Legacy flag retained read-only so pre-migration MongoDB thumbnails still render until replaced. */
  hasCustomThumbnail?: boolean;
  thumbnailUpdatedAt?: Date | null;
  thumbnailSizeBytes?: number | null;
  title: string;
  description: string | null;
  categoryId: string | null;
  durationSeconds: number | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  originalFilename?: string | null;
  published: boolean;
  featured: boolean;
  ageRestricted: boolean;
  /** Local view counter maintained by VibePlay. */
  views: number;
  createdAt: Date;
  updatedAt: Date;
  /** Legacy field kept optional only for reading pre-migration records without deleting data. */
  provider?: string;
}

/**
 * Server-issued upload authorization records (`upload_sessions`).
 * Prevents clients from supplying arbitrary storage paths or creating duplicate
 * records on completion. Auto-cleaned by MongoDB TTL index after 24 hours.
 */
export interface UploadSessionDocument {
  _id: string;
  adminId: string;
  mode: "create" | "replace";
  videoId: string;
  bucket: string;
  videoObjectPath: string;
  videoPublicUrl: string;
  expectedVideoBytes: number;
  expectedVideoMime: string;
  originalFilename: string;
  thumbnailObjectPath: string | null;
  thumbnailPublicUrl: string | null;
  expectedThumbnailBytes: number | null;
  expectedThumbnailMime: string | null;
  status: UploadSessionStatus;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

/**
 * Read-only legacy collection kept for backwards compatibility with pre-migration
 * thumbnails stored in MongoDB before Supabase Storage migration.
 */
export interface VideoThumbnailDocument {
  _id: string;
  videoId: string;
  contentType: "image/jpeg" | "image/webp" | "image/png";
  data: Binary;
  byteLength: number;
  width: number | null;
  height: number | null;
  etag: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoViewDocument {
  _id: string;
  videoId: string;
  /** Privacy-preserving daily dedupe hash (video+ip+ua+date) — never a raw IP. */
  viewerHash: string;
  createdAt: Date;
}

export interface ReportDocument {
  _id: string;
  videoId: string;
  reason: string;
  details: string | null;
  contactEmail: string | null;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface SiteSettingDocument {
  /** Setting key, e.g. "site_name". */
  _id: string;
  value: string | null;
  updatedAt: Date;
}

export interface AuditLogDocument {
  _id: string;
  adminId: string | null;
  adminEmail: string | null;
  action: string;
  details: string | null;
  ip: string | null;
  createdAt: Date;
}

export interface RateLimitDocument {
  /** Compact key: "<action>:<ip-or-hash>". Never stores passwords or API keys. */
  _id: string;
  count: number;
  windowStart: Date;
  /** MongoDB TTL index purges expired rate-limit windows automatically. */
  expiresAt: Date;
}

export interface VibePlayCollections {
  admins: Collection<AdminDocument>;
  adminSessions: Collection<AdminSessionDocument>;
  categories: Collection<CategoryDocument>;
  videos: Collection<VideoDocument>;
  uploadSessions: Collection<UploadSessionDocument>;
  videoThumbnails: Collection<VideoThumbnailDocument>;
  videoViews: Collection<VideoViewDocument>;
  reports: Collection<ReportDocument>;
  siteSettings: Collection<SiteSettingDocument>;
  auditLogs: Collection<AuditLogDocument>;
  rateLimits: Collection<RateLimitDocument>;
}

export function getCollectionsFromDb(db: Db): VibePlayCollections {
  return {
    admins: db.collection<AdminDocument>("admins"),
    adminSessions: db.collection<AdminSessionDocument>("admin_sessions"),
    categories: db.collection<CategoryDocument>("categories"),
    videos: db.collection<VideoDocument>("videos"),
    uploadSessions: db.collection<UploadSessionDocument>("upload_sessions"),
    videoThumbnails: db.collection<VideoThumbnailDocument>("video_thumbnails"),
    videoViews: db.collection<VideoViewDocument>("video_views"),
    reports: db.collection<ReportDocument>("reports"),
    siteSettings: db.collection<SiteSettingDocument>("site_settings"),
    auditLogs: db.collection<AuditLogDocument>("audit_logs"),
    rateLimits: db.collection<RateLimitDocument>("rate_limits"),
  };
}

/**
 * Idempotently creates all unique constraints, query indexes, and TTL indexes.
 * Drops obsolete non-sparse `videos_filecode_unique_idx` if present from pre-migration
 * deployments so new Supabase-hosted videos (which do not use a legacy filecode)
 * can be inserted without duplicate-null errors.
 */
export async function ensureMongoIndexes(db: Db): Promise<void> {
  const c = getCollectionsFromDb(db);

  // Drop obsolete non-sparse filecode unique index if it exists on a migrated DB.
  await c.videos.dropIndex("videos_filecode_unique_idx").catch(() => undefined);

  await Promise.all([
    // Single-owner database-level enforcement (ownerSlot is always 1 + unique email)
    c.admins.createIndex({ ownerSlot: 1 }, { unique: true, name: "admins_owner_slot_unique_idx" }),
    c.admins.createIndex({ email: 1 }, { unique: true, name: "admins_email_unique_idx" }),

    // Server-side sessions + TTL auto-cleanup
    c.adminSessions.createIndex({ tokenHash: 1 }, { unique: true, name: "admin_sessions_token_hash_idx" }),
    c.adminSessions.createIndex({ adminId: 1 }, { name: "admin_sessions_admin_idx" }),
    c.adminSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "admin_sessions_ttl_idx" }),

    // Categories
    c.categories.createIndex({ name: 1 }, { unique: true, name: "categories_name_unique_idx" }),
    c.categories.createIndex({ slug: 1 }, { unique: true, name: "categories_slug_unique_idx" }),

    // Videos — catalog discovery, filtering, sorting, duplicate prevention
    c.videos.createIndex(
      { videoObjectPath: 1 },
      {
        unique: true,
        partialFilterExpression: { videoObjectPath: { $type: "string" } },
        name: "videos_object_path_unique_idx",
      },
    ),
    c.videos.createIndex({ storageProvider: 1 }, { name: "videos_storage_provider_idx" }),
    c.videos.createIndex({ published: 1, createdAt: -1 }, { name: "videos_published_created_idx" }),
    c.videos.createIndex({ published: 1, views: -1, createdAt: -1 }, { name: "videos_published_views_idx" }),
    c.videos.createIndex({ published: 1, featured: -1, createdAt: -1 }, { name: "videos_published_featured_idx" }),
    c.videos.createIndex({ published: 1, categoryId: 1, createdAt: -1 }, { name: "videos_published_category_idx" }),
    c.videos.createIndex({ categoryId: 1 }, { name: "videos_category_idx" }),

    // Upload sessions — unique paths + TTL expiry
    c.uploadSessions.createIndex(
      { videoObjectPath: 1 },
      { unique: true, name: "upload_sessions_video_path_unique_idx" },
    ),
    c.uploadSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "upload_sessions_ttl_idx" }),

    // Views — daily dedupe + 7-day trending
    c.videoViews.createIndex({ videoId: 1, viewerHash: 1 }, { unique: true, name: "video_views_dedupe_idx" }),
    c.videoViews.createIndex({ videoId: 1, createdAt: -1 }, { name: "video_views_video_created_idx" }),
    c.videoViews.createIndex({ createdAt: -1 }, { name: "video_views_created_idx" }),

    // Reports
    c.reports.createIndex({ status: 1, createdAt: -1 }, { name: "reports_status_created_idx" }),
    c.reports.createIndex({ videoId: 1 }, { name: "reports_video_idx" }),

    // Audit logs
    c.auditLogs.createIndex({ createdAt: -1 }, { name: "audit_logs_created_idx" }),

    // Durable rate limits + TTL auto-cleanup
    c.rateLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "rate_limits_ttl_idx" }),
  ]);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}
