import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { getClientIp } from "@/server/lib/rate-limit";
import { requestOwnerPasswordRecovery } from "@/server/services/auth";

export const dynamic = "force-dynamic";

const recoverySchema = z.object({
  email: z.string().email("Enter a valid email address.").max(255),
});

/**
 * Owner-only password recovery check.
 * Rejects every email address other than markket287@gmail.com (403) and never
 * auto-authenticates. Returns honest out-of-band Atlas recovery instructions.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const parsed = recoverySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: "Enter a valid email address." }, 400);
    }
    const result = await requestOwnerPasswordRecovery(parsed.data.email, getClientIp(req));
    return jsonOk(result);
  });
}
