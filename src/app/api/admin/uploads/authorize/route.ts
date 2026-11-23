import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { getFreePlanLimitsSummary } from "@/server/services/supabase-storage";
import {
  authorizeSupabaseUpload,
  getTrackedSupabaseStorageUsage,
} from "@/server/services/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authorizeSchema = z.object({
  filename: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  thumbnailMimeType: z.string().max(120).nullable().optional(),
  thumbnailSizeBytes: z.number().int().positive().nullable().optional(),
  replaceVideoId: z.string().min(1).max(120).nullable().optional(),
});

/**
 * Returns Supabase Free-plan upload configuration and current tracked storage
 * usage for the authenticated owner. Never exposes `SUPABASE_SECRET_KEY`.
 */
export async function GET() {
  return handleRoute(async () => {
    await requireAdminOrThrow();
    const limits = getFreePlanLimitsSummary();
    const usage = await getTrackedSupabaseStorageUsage();
    return jsonOk({
      ...limits,
      usedBytes: usage.usedBytes,
      videoBytes: usage.videoBytes,
      thumbnailBytes: usage.thumbnailBytes,
      videoCount: usage.videoCount,
      quota: usage.quota,
    });
  });
}

/**
 * Mints short-lived signed Supabase Storage upload tokens for a validated MP4
 * video (<= 50 MB) and its auto-generated thumbnail (<= 512 KB).
 * Enforces owner authentication, CSRF origin, MongoDB rate limiting, Free-plan
 * storage thresholds, and server-generated collision-resistant object paths.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const ip = getClientIp(req);
    await enforceRateLimit("upload_authorize", ip, 25, 60 * 60 * 1000);

    const parsed = authorizeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk(
        { error: parsed.error.issues[0]?.message ?? "Invalid upload authorization request." },
        400,
      );
    }

    const grant = await authorizeSupabaseUpload(parsed.data, { adminId: admin.id, ip });
    return jsonOk(grant, 201);
  });
}
