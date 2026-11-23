import { handleRoute, jsonOk } from "@/server/lib/http";
import { getPublicSettings, getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** Public branding, social links, age-gate and ad availability. */
export async function GET() {
  return handleRoute(async () => {
    const settings = await getSettings();
    return jsonOk(getPublicSettings(settings));
  });
}
