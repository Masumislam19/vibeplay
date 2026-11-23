import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { recordAudit, requireAdminOrThrow } from "@/server/services/auth";
import { getSettings, updateSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  siteName: z.string().min(1).max(80),
  siteTagline: z.string().max(120),
  siteDescription: z.string().max(300),
  contactEmail: z.string().max(255),
  logoUrl: z.string().max(500),
  socialTwitter: z.string().max(300),
  socialYoutube: z.string().max(300),
  socialInstagram: z.string().max(300),
  ageGateEnabled: z.boolean(),
  adsEnabled: z.boolean(),
  adHomeHtml: z.string().max(10000),
  adListHtml: z.string().max(10000),
  adWatchHtml: z.string().max(10000),
});

export async function GET() {
  return handleRoute(async () => {
    await requireAdminOrThrow();
    return jsonOk(await getSettings());
  });
}

export async function PUT(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: parsed.error.issues[0]?.message ?? "Invalid settings payload." }, 400);
    }
    await updateSettings(parsed.data);
    await recordAudit("settings.update", admin.id, admin.email, "Site settings updated", getClientIp(req));
    return jsonOk({ ok: true });
  });
}
