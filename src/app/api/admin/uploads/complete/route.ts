import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import {
  cancelSupabaseUpload,
  completeSupabaseUpload,
} from "@/server/services/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const completeSchema = z.object({
  uploadSessionId: z.string().min(1).max(120),
  title: z.string().max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  ageRestricted: z.boolean().optional(),
  published: z.boolean().optional(),
  thumbnailUploaded: z.boolean().optional(),
});

const cancelSchema = z.object({
  uploadSessionId: z.string().min(1).max(120),
});

/**
 * Verifies the uploaded Supabase Storage object exists and saves/updates the
 * MongoDB video record atomically (preventing duplicate creations).
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const ip = getClientIp(req);
    await enforceRateLimit("upload_complete", ip, 25, 60 * 60 * 1000);

    const parsed = completeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk(
        { error: parsed.error.issues[0]?.message ?? "Invalid upload completion payload." },
        400,
      );
    }

    const result = await completeSupabaseUpload(parsed.data, { adminId: admin.id, ip });
    return jsonOk(result, 201);
  });
}

/** Cancels a pending upload session and removes any partial object from Supabase Storage. */
export async function DELETE(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const ip = getClientIp(req);

    const parsed = cancelSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "uploadSessionId is required." }, 400);
    }

    await cancelSupabaseUpload(parsed.data.uploadSessionId, { adminId: admin.id, ip });
    return jsonOk({ cancelled: true });
  });
}
