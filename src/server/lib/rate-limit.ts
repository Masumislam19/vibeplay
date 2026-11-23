import crypto from "node:crypto";
import { DatabaseNotConfiguredError, getCollections } from "@/db";
import { HttpError } from "./http";

/**
 * Persistent, atomic rate limiting backed by MongoDB Atlas (`rate_limits` collection).
 *
 * Every counter increment runs as a single atomic `findOneAndUpdate` pipeline
 * operation, so concurrent requests handled by separate Netlify Function
 * instances cannot bypass limits. Expired windows are reset atomically in-place
 * and purged automatically by MongoDB's TTL index on `expiresAt`.
 *
 * Documents are compact (`_id`, `count`, `windowStart`, `expiresAt`) and never
 * store raw passwords, setup keys, or API secrets.
 */

const MAX_KEY_LENGTH = 160;

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Builds a compact, credential-free rate-limit key. */
function buildKey(action: string, identity: string): string {
  const cleanAction = action.replace(/[^a-z0-9_.-]/gi, "").slice(0, 40) || "req";
  const raw = `${cleanAction}:${identity}`;
  if (raw.length <= MAX_KEY_LENGTH) return raw;
  const digest = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 48);
  return `${cleanAction}:${digest}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number | null;
}

async function incrementAtomic(key: string, windowMs: number): Promise<{ count: number; expiresAt: Date }> {
  const { rateLimits } = await getCollections();
  const now = new Date();
  const nextExpiresAt = new Date(now.getTime() + windowMs);

  const pipeline = [
    {
      $set: {
        count: {
          $cond: [
            {
              $or: [
                { $eq: [{ $type: "$expiresAt" }, "missing"] },
                { $lte: ["$expiresAt", now] },
              ],
            },
            1,
            { $add: ["$count", 1] },
          ],
        },
        windowStart: {
          $cond: [
            {
              $or: [
                { $eq: [{ $type: "$expiresAt" }, "missing"] },
                { $lte: ["$expiresAt", now] },
              ],
            },
            now,
            "$windowStart",
          ],
        },
        expiresAt: {
          $cond: [
            {
              $or: [
                { $eq: [{ $type: "$expiresAt" }, "missing"] },
                { $lte: ["$expiresAt", now] },
              ],
            },
            nextExpiresAt,
            "$expiresAt",
          ],
        },
      },
    },
  ];

  const runOnce = () =>
    rateLimits.findOneAndUpdate({ _id: key }, pipeline, {
      upsert: true,
      returnDocument: "after",
    });

  let doc;
  try {
    doc = await runOnce();
  } catch (error) {
    // Handle rare simultaneous upsert collision on first write for a new key.
    if (isDuplicateKeyError(error)) {
      doc = await runOnce();
    } else {
      throw error;
    }
  }

  if (!doc) {
    throw new HttpError(503, "Rate limiter could not update counter in MongoDB.");
  }
  return { count: doc.count, expiresAt: doc.expiresAt };
}

/**
 * Atomic MongoDB-backed rate limit.
 * Throws HttpError(429) when the limit is exceeded (unless `throwOnLimit: false`),
 * and propagates `DatabaseNotConfiguredError` (503) honestly if MongoDB is unset.
 */
export async function enforceRateLimit(
  action: string,
  identity: string,
  limit: number,
  windowMs: number,
  options: { throwOnLimit?: boolean } = {},
): Promise<RateLimitResult> {
  const key = buildKey(action, identity);

  let updated: { count: number; expiresAt: Date };
  try {
    updated = await incrementAtomic(key, windowMs);
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError || error instanceof HttpError) {
      throw error;
    }
    console.error(
      "[vibeplay] MongoDB rate limiter error:",
      error instanceof Error ? error.message : "unknown error",
    );
    throw new HttpError(503, "Rate limiting service is temporarily unavailable.");
  }

  const allowed = updated.count <= limit;
  const retryAfterSeconds = allowed
    ? null
    : Math.max(1, Math.ceil((updated.expiresAt.getTime() - Date.now()) / 1000));

  const result: RateLimitResult = {
    allowed,
    count: updated.count,
    limit,
    retryAfterSeconds,
  };

  if (!result.allowed && options.throwOnLimit !== false) {
    throw new HttpError(429, `Too many requests. Please try again in ${retryAfterSeconds ?? 60}s.`);
  }
  return result;
}

/** Clears all rate-limit documents (for test harnesses). */
export async function resetRateLimits(): Promise<void> {
  const { rateLimits } = await getCollections();
  await rateLimits.deleteMany({});
}
