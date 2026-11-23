import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { clearSessionCookie, recordAudit, requireAdminOrThrow, revokeAllSessions } from "@/server/services/auth";

export const dynamic = "force-dynamic";

/** Revoke every session for this admin (including the current one). */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    await revokeAllSessions(admin.id);
    await clearSessionCookie();
    await recordAudit("sessions.revoke", admin.id, admin.email, "All sessions revoked", getClientIp(req));
    return jsonOk({ ok: true });
  });
}
