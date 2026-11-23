import crypto from "node:crypto";
import { handleRoute, jsonError, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import { incrementView } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/**
 * Local view tracking. One view per viewer per video per day (privacy-preserving
 * hash of ip+user-agent+date — raw IPs are never stored for views).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const { id } = await params;
    const ip = getClientIp(req);
    await enforceRateLimit("view", ip, 120, 60 * 60 * 1000);

    const userAgent = req.headers.get("user-agent") ?? "unknown";
    const day = new Date().toISOString().slice(0, 10);
    const viewerHash = crypto.createHash("sha256").update(`${id}:${ip}:${userAgent}:${day}`).digest("hex");

    const result = await incrementView(id, viewerHash);
    if (!result.videoFound) return jsonError(404, "Video not found.");
    return jsonOk({ counted: result.counted });
  });
}
