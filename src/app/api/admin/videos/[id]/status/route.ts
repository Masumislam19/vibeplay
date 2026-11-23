import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { checkProviderStatus } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** Check Vidara encoding status for this video and persist the resulting state. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const { id } = await params;
    const result = await checkProviderStatus(id, { adminId: admin.id, ip: getClientIp(req) });
    return jsonOk(result);
  });
}
