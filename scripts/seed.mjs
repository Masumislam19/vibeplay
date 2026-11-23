/**
 * VibePlay MongoDB Atlas seed & index bootstrap script — idempotent.
 *
 * Creates all required indexes (single-owner unique lock, TTL indexes for
 * sessions, upload sessions & rate limits, sparse unique index for Supabase
 * video object paths, query indexes) and seeds starter categories.
 *
 * Usage:
 *   node scripts/seed.mjs
 * Requires MONGODB_URI (and optional MONGODB_DB_NAME, default "vibeplay").
 */
import "dotenv/config";
import crypto from "node:crypto";
import { MongoClient } from "mongodb";

const CATEGORIES = [
  ["Action", "High-energy films, stunts and thrillers."],
  ["Animation", "Animated films, series and motion design."],
  ["Comedy", "Stand-up, sketches and comedic shorts."],
  ["Documentary", "Real stories, journalism and deep dives."],
  ["Education", "Tutorials, explainers and courses."],
  ["Entertainment", "General entertainment and variety."],
  ["Film", "Short films, indie cinema and festival cuts."],
  ["Gaming", "Gameplay, reviews and esports."],
  ["Music", "Music videos, sessions and concerts."],
  ["News", "News reports and current affairs."],
  ["Science & Nature", "Space, biology, physics and the outdoors."],
  ["Sports", "Highlights, analysis and competition."],
  ["Technology", "Reviews, engineering and software."],
  ["Travel", "Journeys, guides and destinations."],
  ["Vlog", "Personal stories and day-in-the-life content."],
];

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB_NAME?.trim() || "vibeplay";

if (!uri) {
  console.error(
    "MONGODB_URI is required. Copy .env.example to .env and configure your MongoDB Atlas connection string.",
  );
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
try {
  await client.connect();
  const db = client.db(dbName);

  // Drop obsolete non-sparse filecode unique index if present from pre-migration databases.
  await db.collection("videos").dropIndex("videos_filecode_unique_idx").catch(() => undefined);

  await Promise.all([
    db.collection("admins").createIndex({ ownerSlot: 1 }, { unique: true, name: "admins_owner_slot_unique_idx" }),
    db.collection("admins").createIndex({ email: 1 }, { unique: true, name: "admins_email_unique_idx" }),
    db.collection("admin_sessions").createIndex({ tokenHash: 1 }, { unique: true, name: "admin_sessions_token_hash_idx" }),
    db.collection("admin_sessions").createIndex({ adminId: 1 }, { name: "admin_sessions_admin_idx" }),
    db.collection("admin_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "admin_sessions_ttl_idx" }),
    db.collection("categories").createIndex({ name: 1 }, { unique: true, name: "categories_name_unique_idx" }),
    db.collection("categories").createIndex({ slug: 1 }, { unique: true, name: "categories_slug_unique_idx" }),
    db.collection("videos").createIndex(
      { videoObjectPath: 1 },
      {
        unique: true,
        partialFilterExpression: { videoObjectPath: { $type: "string" } },
        name: "videos_object_path_unique_idx",
      },
    ),
    db.collection("videos").createIndex({ storageProvider: 1 }, { name: "videos_storage_provider_idx" }),
    db.collection("videos").createIndex({ published: 1, createdAt: -1 }, { name: "videos_published_created_idx" }),
    db.collection("videos").createIndex({ published: 1, views: -1, createdAt: -1 }, { name: "videos_published_views_idx" }),
    db.collection("videos").createIndex({ published: 1, featured: -1, createdAt: -1 }, { name: "videos_published_featured_idx" }),
    db.collection("videos").createIndex({ published: 1, categoryId: 1, createdAt: -1 }, { name: "videos_published_category_idx" }),
    db.collection("videos").createIndex({ categoryId: 1 }, { name: "videos_category_idx" }),
    db.collection("upload_sessions").createIndex({ videoObjectPath: 1 }, { unique: true, name: "upload_sessions_video_path_unique_idx" }),
    db.collection("upload_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "upload_sessions_ttl_idx" }),
    db.collection("video_views").createIndex({ videoId: 1, viewerHash: 1 }, { unique: true, name: "video_views_dedupe_idx" }),
    db.collection("video_views").createIndex({ videoId: 1, createdAt: -1 }, { name: "video_views_video_created_idx" }),
    db.collection("video_views").createIndex({ createdAt: -1 }, { name: "video_views_created_idx" }),
    db.collection("reports").createIndex({ status: 1, createdAt: -1 }, { name: "reports_status_created_idx" }),
    db.collection("reports").createIndex({ videoId: 1 }, { name: "reports_video_idx" }),
    db.collection("audit_logs").createIndex({ createdAt: -1 }, { name: "audit_logs_created_idx" }),
    db.collection("rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "rate_limits_ttl_idx" }),
  ]);

  const categories = db.collection("categories");
  let inserted = 0;
  const now = new Date();
  for (const [name, description] of CATEGORIES) {
    const slug = slugify(name);
    const result = await categories.updateOne(
      { slug },
      {
        $setOnInsert: {
          _id: crypto.randomUUID(),
          name,
          slug,
          description,
          createdAt: now,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) inserted += 1;
  }

  const total = await categories.countDocuments();
  console.log(
    `MongoDB Atlas (${dbName}) seed complete: indexes verified, ${inserted} new categories (${total} total).`,
  );
  console.log(
    "Next step: visit /admin/setup with ADMIN_SETUP_KEY and markket287@gmail.com to create the owner account.",
  );
} catch (error) {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
