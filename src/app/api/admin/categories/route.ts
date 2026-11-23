import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { recordAudit, requireAdminOrThrow } from "@/server/services/auth";
import { createCategory, listCategoriesWithCounts } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
});

export async function GET() {
  return handleRoute(async () => {
    await requireAdminOrThrow();
    const categories = await listCategoriesWithCounts(false);
    return jsonOk({ categories });
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Category name is required." }, 400);
    }
    const category = await createCategory(parsed.data.name, parsed.data.description ?? null);
    await recordAudit("category.create", admin.id, admin.email, `Created category "${category.name}"`, getClientIp(req));
    return jsonOk({ category }, 201);
  });
}
