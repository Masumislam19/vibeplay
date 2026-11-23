import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { deleteProviderVideo } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  confirmDeleteProvider: z.literal(true),
});

/**
 * Deletes the video from Vidara (documented /v1/video/delete endpoint).
 * Requires explicit confirmation and never runs as a side effect of a
 * local database removal.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const { id } = await params;
    const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Explicit confirmation is required to delete from Vidara." }, 400);
    }
    await deleteProviderVideo(id, true, { adminId: admin.id, ip: getClientIp(req) });
    return jsonOk({ ok: true });
  });
}
