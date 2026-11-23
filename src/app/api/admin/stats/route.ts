import { handleRoute, jsonOk } from "@/server/lib/http";
import { requireAdminOrThrow } from "@/server/services/auth";
import { getAdminStats } from "@/server/services/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    await requireAdminOrThrow();
    const stats = await getAdminStats();
    return jsonOk(stats);
  });
}
