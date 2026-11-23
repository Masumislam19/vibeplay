import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { extractVidaraFilecode } from "@/server/services/vidara";
import { registerVideoFromVidara } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  source: z.string().min(4).max(500),
  title: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  ageRestricted: z.boolean().optional(),
  published: z.boolean().optional(),
});

/** Registers an existing Vidara video via share URL or filecode. Duplicate filecodes are refused. */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const ip = getClientIp(req);
    await enforceRateLimit("register", ip, 20, 60 * 60 * 1000);

    const parsed = registerSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Provide a Vidara share URL or filecode." }, 400);
    }

    let filecode: string;
    try {
      filecode = extractVidaraFilecode(parsed.data.source);
    } catch (error) {
      return jsonOk({ error: error instanceof Error ? error.message : "Invalid source." }, 400);
    }

    const video = await registerVideoFromVidara(
      { ...parsed.data, filecode },
      { adminId: admin.id, ip },
    );
    return jsonOk({ video }, 201);
  });
}
