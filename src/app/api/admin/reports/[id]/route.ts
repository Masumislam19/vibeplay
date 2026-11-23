import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { resolveReport } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  unpublishVideo: z.boolean().optional(),
});

/** Resolve/dismiss a report, optionally unpublishing the reported video. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Provide a valid report resolution." }, 400);
    }
    await resolveReport(id, parsed.data.status, parsed.data.unpublishVideo ?? false, {
      adminId: admin.id,
      ip: getClientIp(req),
    });
    return jsonOk({ ok: true });
  });
}
