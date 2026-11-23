import { z } from "zod";
import { handleRoute, jsonError, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { deleteVideoAndMedia, getVideoById, updateVideo } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
  ageRestricted: z.boolean().optional(),
});

/** Fetch a single video (including drafts / legacy records) for admin edit or replacement. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireAdminOrThrow();
    const { id } = await params;
    const video = await getVideoById(id, false);
    if (!video) return jsonError(404, "Video not found.");
    return jsonOk({ video });
  });
}

/** Edit title/description/category, publish, feature, age-restrict. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Invalid video update payload." }, 400);
    }
    const video = await updateVideo(id, parsed.data, { adminId: admin.id, ip: getClientIp(req) });
    return jsonOk({ video });
  });
}

/**
 * Deletes the video's Supabase Storage video + thumbnail objects (if hosted on
 * Supabase) and removes the MongoDB video record + views + reports.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const { id } = await params;
    const result = await deleteVideoAndMedia(id, { adminId: admin.id, ip: getClientIp(req) });
    return jsonOk({ ok: true, deletedStoragePaths: result.deletedStoragePaths });
  });
}
