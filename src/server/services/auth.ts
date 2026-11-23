import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getCollections, isMongoConfigured } from "@/db";
import { HttpError } from "@/server/lib/http";
import { enforceRateLimit } from "@/server/lib/rate-limit";

/**
 * Single-owner admin authentication backed by MongoDB Atlas.
 *
 * Security guarantees:
 * - Strictly restricted to ONE authorized owner email (`AUTHORIZED_OWNER_EMAIL`)
 *   enforced server-side across setup, login, session validation, password
 *   recovery, and every protected admin API.
 * - No public registration, no second admin account, no auto-authentication.
 * - Atomic DB-level singleton via UNIQUE index on `admins.ownerSlot` (always 1)
 *   and UNIQUE index on `admins.email`.
 * - Passwords hashed with Node.js `scrypt` (random salt + timing-safe verify).
 * - Server-side sessions in `admin_sessions` with hashed opaque tokens,
 *   HTTP-only SameSite=Lax cookies (Secure in production), and MongoDB TTL index.
 */

export const AUTHORIZED_OWNER_EMAIL = "markket287@gmail.com";
export const SESSION_COOKIE = "vp_session";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_RATE_LIMIT = 8;
const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000;
const RECOVERY_RATE_LIMIT = 5;
const RECOVERY_RATE_WINDOW_MS = 60 * 60 * 1000;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAuthorizedOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return normalizeEmail(email) === AUTHORIZED_OWNER_EMAIL;
}

/** Server-side guard enforcing that only the single authorized owner email is allowed. */
export function assertAuthorizedOwnerEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (normalized !== AUTHORIZED_OWNER_EMAIL) {
    throw new HttpError(403, "This email address is not authorized for VibePlay owner access.");
  }
  return normalized;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: number }).code === 11000;
}

export interface SessionAdmin {
  id: string;
  email: string;
}

export async function getAdminCount(): Promise<number> {
  const { admins } = await getCollections();
  return admins.countDocuments({}, { limit: 1 });
}

export async function isSetupConfigured(): Promise<boolean> {
  return Boolean(process.env.ADMIN_SETUP_KEY?.trim());
}

/**
 * One-time owner setup.
 *
 * Requires:
 *  - Server-side `ADMIN_SETUP_KEY` (verified in constant time; never hardcoded)
 *  - Authorized owner email (`markket287@gmail.com`)
 *  - Strong password + matching confirmation
 *
 * Enforced atomically by MongoDB's unique index on `admins.ownerSlot` (always 1),
 * so simultaneous requests cannot create more than one owner account.
 */
export async function setupOwner(
  setupKey: string,
  email: string,
  password: string,
  confirmPassword: string,
  ip: string,
): Promise<SessionAdmin> {
  const configuredKey = process.env.ADMIN_SETUP_KEY?.trim();
  if (!configuredKey) {
    throw new HttpError(
      503,
      "Owner setup is disabled because ADMIN_SETUP_KEY is not configured on this server.",
    );
  }
  if (!timingSafeEquals(setupKey, configuredKey)) {
    await recordAudit("owner.setup_rejected_key", null, null, "Incorrect setup key submitted", ip);
    throw new HttpError(403, "The setup key is incorrect.");
  }

  const authorizedEmail = assertAuthorizedOwnerEmail(email);

  if (password !== confirmPassword) {
    throw new HttpError(400, "Password and password confirmation do not match.");
  }

  const { admins } = await getCollections();
  const now = new Date();
  const adminId = crypto.randomUUID();
  const passwordHash = hashPassword(password);

  try {
    await admins.insertOne({
      _id: adminId,
      email: authorizedEmail,
      passwordHash,
      ownerSlot: 1,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      throw new HttpError(409, "An owner account already exists. Public owner setup is permanently disabled.");
    }
    throw error;
  }

  await recordAudit("owner.setup", adminId, authorizedEmail, "Owner account created via one-time setup", ip);
  return { id: adminId, email: authorizedEmail };
}

/**
 * Owner login.
 * Rejects every email except `AUTHORIZED_OWNER_EMAIL` and always requires a
 * valid scrypt-verified password. Rate-limited durably via MongoDB.
 */
export async function login(
  email: string,
  password: string,
  ip: string,
  userAgent: string | null,
): Promise<string> {
  await enforceRateLimit("login", ip, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS);

  const normalized = normalizeEmail(email);
  if (!isAuthorizedOwnerEmail(normalized)) {
    // Burn scrypt time so rejected emails do not short-circuit noticeably.
    verifyPassword(password, hashPassword("unauthorized-email-timing-burn"));
    await recordAudit("login.rejected_email", null, null, `Rejected unauthorized login email`, ip);
    throw new HttpError(403, "This email address is not authorized for VibePlay owner access.");
  }

  const { admins, adminSessions } = await getCollections();
  const admin = await admins.findOne({ email: AUTHORIZED_OWNER_EMAIL, ownerSlot: 1 });
  if (!admin) {
    verifyPassword(password, hashPassword("missing-owner-timing-burn"));
    await recordAudit("login.failed", null, normalized, "Owner account not set up yet", ip);
    throw new HttpError(401, "Invalid email or password.");
  }

  const valid = verifyPassword(password, admin.passwordHash);
  if (!valid) {
    await recordAudit("login.failed", admin._id, admin.email, "Failed login attempt (wrong password)", ip);
    throw new HttpError(401, "Invalid email or password.");
  }

  // Purge expired sessions eagerly (in addition to MongoDB's background TTL sweep).
  await adminSessions.deleteMany({ expiresAt: { $lte: new Date() } });

  const token = await createSessionToken(admin._id, admin.email, ip, userAgent);
  await recordAudit("login.success", admin._id, admin.email, "Signed in", ip);
  return token;
}

/**
 * Owner-only password recovery check.
 * Rejects all unauthorized emails (403) and never auto-authenticates or fabricates
 * an email send — provides honest out-of-band instructions for the owner.
 */
export async function requestOwnerPasswordRecovery(
  email: string,
  ip: string,
): Promise<{ message: string }> {
  await enforceRateLimit("recovery", ip, RECOVERY_RATE_LIMIT, RECOVERY_RATE_WINDOW_MS);

  const authorizedEmail = assertAuthorizedOwnerEmail(email);
  const { admins } = await getCollections();
  const owner = await admins.findOne({ email: authorizedEmail, ownerSlot: 1 });
  if (!owner) {
    throw new HttpError(404, "The owner account has not been created yet. Complete /admin/setup first.");
  }

  await recordAudit(
    "recovery.requested",
    owner._id,
    owner.email,
    "Password recovery requested for authorized owner",
    ip,
  );

  return {
    message:
      "Automated email delivery is not configured on this server. To recover access, remove the owner document in MongoDB Atlas (database vibeplay, collection admins), revoke sessions in admin_sessions, verify ADMIN_SETUP_KEY is set in Netlify, and re-run /admin/setup with markket287@gmail.com.",
  };
}

/** Creates a MongoDB session document and returns the raw opaque token (for the HTTP-only cookie). */
export async function createSessionToken(
  adminId: string,
  email: string,
  ip: string,
  userAgent: string | null,
): Promise<string> {
  const authorizedEmail = assertAuthorizedOwnerEmail(email);
  const { adminSessions } = await getCollections();
  const token = crypto.randomBytes(48).toString("hex");
  const now = new Date();

  await adminSessions.insertOne({
    _id: crypto.randomUUID(),
    adminId,
    email: authorizedEmail,
    tokenHash: sha256(token),
    ip: ip.slice(0, 64),
    userAgent: userAgent?.slice(0, 255) ?? null,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    createdAt: now,
  });

  return token;
}

/** Validates a session token and strictly verifies the owner email matches `AUTHORIZED_OWNER_EMAIL`. */
export async function getAdminFromToken(token: string): Promise<SessionAdmin | null> {
  if (!isMongoConfigured()) return null;
  const { admins, adminSessions } = await getCollections();
  const tokenHash = sha256(token);

  const session = await adminSessions.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  if (!isAuthorizedOwnerEmail(session.email)) {
    await adminSessions.deleteOne({ _id: session._id });
    return null;
  }

  const admin = await admins.findOne({ _id: session.adminId, ownerSlot: 1 });
  if (!admin || !isAuthorizedOwnerEmail(admin.email)) {
    await adminSessions.deleteOne({ _id: session._id });
    return null;
  }

  return { id: admin._id, email: admin.email };
}

/** Reads the session cookie and resolves the authorized owner, or null for anonymous visitors. */
export async function requireAdmin(): Promise<SessionAdmin | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getAdminFromToken(token);
}

/** Route-handler guard: resolves the authorized owner or throws 401. */
export async function requireAdminOrThrow(): Promise<SessionAdmin> {
  const admin = await requireAdmin();
  if (!admin || !isAuthorizedOwnerEmail(admin.email)) {
    throw new HttpError(401, "Authentication required.");
  }
  return admin;
}

export async function destroySession(token: string): Promise<void> {
  if (!isMongoConfigured()) return;
  const { adminSessions } = await getCollections();
  await adminSessions.deleteOne({ tokenHash: sha256(token) });
}

export async function revokeAllSessions(adminId: string): Promise<void> {
  const { adminSessions } = await getCollections();
  await adminSessions.deleteMany({ adminId });
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function recordAudit(
  action: string,
  adminId: string | null,
  adminEmail: string | null,
  details: string,
  ip: string,
): Promise<void> {
  if (!isMongoConfigured()) return;
  try {
    const { auditLogs } = await getCollections();
    await auditLogs.insertOne({
      _id: crypto.randomUUID(),
      adminId,
      adminEmail,
      action: action.slice(0, 100),
      details: details.slice(0, 500),
      ip: ip.slice(0, 64),
      createdAt: new Date(),
    });
  } catch (error) {
    // Audit failures must never break the main request or log secrets.
    console.error("[vibeplay] audit log write failed:", error instanceof Error ? error.message : "unknown error");
  }
}
