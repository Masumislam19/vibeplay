import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { login, setSessionCookie } from "@/server/services/auth";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const parsed = loginSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Enter a valid email and password." }, 400);
    }

    const ip = getClientIp(req);
    const token = await login(parsed.data.email, parsed.data.password, ip, req.headers.get("user-agent"));
    await setSessionCookie(token);
    return jsonOk({ ok: true });
  });
}
