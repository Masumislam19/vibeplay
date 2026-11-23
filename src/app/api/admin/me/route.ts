import { handleRoute, jsonOk } from "@/server/lib/http";
import { requireAdmin } from "@/server/services/auth";

export const dynamic = "force-dynamic";

/** Current session introspection used by admin pages and the login screen. */
export async function GET() {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    return jsonOk({ admin });
  });
}
