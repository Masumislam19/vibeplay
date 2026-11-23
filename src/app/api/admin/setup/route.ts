import { z } from "zod";
import { isMongoConfigured } from "@/db";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import {
  AUTHORIZED_OWNER_EMAIL,
  createSessionToken,
  getAdminCount,
  isSetupConfigured,
  requireAdminOrThrow,
  setSessionCookie,
  setupOwner,
} from "@/server/services/auth";

export const dynamic = "force-dynamic";

const setupSchema = z
  .object({
    setupKey: z.string().min(1, "Setup key is required.").max(200),
    email: z.string().email("Enter a valid email address.").max(255),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters.")
      .max(200)
      .regex(/[A-Za-z]/, "Password must contain a letter.")
      .regex(/[0-9]/, "Password must contain a number."),
    confirmPassword: z.string().min(1, "Password confirmation is required.").max(200),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password and password confirmation do not match.",
    path: ["confirmPassword"],
  });

/** Bootstrap status for the setup page (no secrets returned). */
export async function GET() {
  return handleRoute(async () => {
    const dbConfigured = isMongoConfigured();
    const setupConfigured = await isSetupConfigured();
    const adminExists = dbConfigured ? (await getAdminCount()) > 0 : false;
    return jsonOk({
      dbConfigured,
      adminExists,
      setupConfigured,
      authorizedOwnerEmail: AUTHORIZED_OWNER_EMAIL,
    });
  });
}

/**
 * One-time owner creation.
 * Requires server-side ADMIN_SETUP_KEY, authorized email (markket287@gmail.com),
 * strong password, and matching confirmPassword. Enforced atomically by MongoDB.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    await enforceRateLimit("setup", ip, 5, 60 * 60 * 1000);

    const parsed = setupSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonOk({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);
    }

    const admin = await setupOwner(
      parsed.data.setupKey,
      parsed.data.email,
      parsed.data.password,
      parsed.data.confirmPassword,
      ip,
    );
    const token = await createSessionToken(admin.id, admin.email, ip, req.headers.get("user-agent"));
    await setSessionCookie(token);
    return jsonOk({ admin }, 201);
  });
}

export async function PUT() {
  const admin = await requireAdminOrThrow().catch(() => null);
  if (admin) return jsonOk({ error: "Owner already exists. Use the dashboard instead." }, 409);
  return jsonOk({ error: "Setup is only available via POST." }, 405);
}
