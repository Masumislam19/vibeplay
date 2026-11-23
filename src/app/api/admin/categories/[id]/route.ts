import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { recordAudit, requireAdminOrThrow } from "@/server/services/auth";
import { deleteCategory, updateCategory } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Invalid category update." }, 400);
    }
    await updateCategory(id, parsed.data);
    await recordAudit("category.update", admin.id, admin.email, `Renamed/edited category ${id.slice(0, 8)}`, getClientIp(req));
    return jsonOk({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const { id } = await params;
    await deleteCategory(id);
    await recordAudit("category.delete", admin.id, admin.email, `Deleted category ${id.slice(0, 8)}`, getClientIp(req));
    return jsonOk({ ok: true });
  });
}
