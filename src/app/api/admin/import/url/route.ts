import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { importVideoFromUrl } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  url: z.string().min(8).max(2000),
  name: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  ageRestricted: z.boolean().optional(),
  published: z.boolean().optional(),
});

/** Server-side HTTPS URL import through Vidara /v1/upload/url (SSRF-guarded, rate limited). */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const ip = getClientIp(req);
    await enforceRateLimit("import", ip, 10, 60 * 60 * 1000);

    const parsed = importSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Provide a valid HTTPS video URL." }, 400);
    }

    const result = await importVideoFromUrl(parsed.data, { adminId: admin.id, ip });
    return jsonOk({ video: result.video, processing: result.processing }, 201);
  });
}
