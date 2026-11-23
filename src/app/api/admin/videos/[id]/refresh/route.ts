import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { refreshVideoMetadata } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** Pull the latest real metadata from Vidara for this video. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const { id } = await params;
    const video = await refreshVideoMetadata(id, { adminId: admin.id, ip: getClientIp(req) });
    return jsonOk({ video });
  });
}
