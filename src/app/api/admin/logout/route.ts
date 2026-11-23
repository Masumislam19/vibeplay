import { cookies } from "next/headers";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { clearSessionCookie, destroySession, recordAudit, SESSION_COOKIE } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) {
      await destroySession(token);
      await recordAudit("logout", null, null, "Signed out", getClientIp(req));
    }
    await clearSessionCookie();
    return jsonOk({ ok: true });
  });
}
