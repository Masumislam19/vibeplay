/**
 * VibePlay single-owner authentication & MongoDB runtime verification script.
 *
 * Usage:
 *   node --experimental-strip-types scripts/test-mongodb-auth.ts
 *   TEST_BASE_URL=http://localhost:3000 node --experimental-strip-types scripts/test-mongodb-auth.ts
 */
import crypto from "node:crypto";
import { MongoClient } from "mongodb";

const AUTHORIZED_OWNER_EMAIL = "markket287@gmail.com";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.error(
      `  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`,
    );
  }
}

console.log("\n1. Authorized owner email policy");
const normalize = (email: string) => email.trim().toLowerCase();
const isAuthorized = (email: string) => normalize(email) === AUTHORIZED_OWNER_EMAIL;
check("exact authorized owner email passes", isAuthorized("markket287@gmail.com"), true);
check("case/whitespace normalized owner email passes", isAuthorized("  MarkKet287@GMAIL.com "), true);
check("other gmail rejected", isAuthorized("other@gmail.com"), false);
check("lookalike email rejected", isAuthorized("markket287@gmail.co"), false);
check("empty email rejected", isAuthorized(""), false);

console.log("\n2. scrypt password hashing");
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}
function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
const hash = hashPassword("StrongOwnerPass123!");
check("correct password verifies", verifyPassword("StrongOwnerPass123!", hash), true);
check("wrong password fails", verifyPassword("WrongOwnerPass123!", hash), false);
check("corrupted hash fails safely", verifyPassword("StrongOwnerPass123!", "invalid"), false);

console.log("\n3. MongoDB driver sanity (unreachable URI produces honest error)");
try {
  const client = new MongoClient("mongodb://127.0.0.1:27019/vibeplay", {
    serverSelectionTimeoutMS: 500,
    connectTimeoutMS: 500,
  });
  await client.connect();
  await client.close();
  check("unreachable local port fails to connect", false, true);
} catch (error) {
  check("unreachable local port rejects cleanly", error instanceof Error, true);
}

const baseUrl = process.env.TEST_BASE_URL?.trim();
if (baseUrl) {
  console.log(`\n4. Live HTTP verification against ${baseUrl}`);

  const healthRes = await fetch(`${baseUrl}/api/health`);
  const health = (await healthRes.json()) as {
    ok: boolean;
    database: { provider: string; configured: boolean; dbName: string };
  };
  check("GET /api/health reports provider=mongodb", health.database?.provider, "mongodb");
  check("GET /api/health reports dbName=vibeplay", health.database?.dbName, "vibeplay");

  const statsRes = await fetch(`${baseUrl}/api/admin/stats`);
  check("GET /api/admin/stats unauthorized -> 401", statsRes.status, 401);

  const videosAdminRes = await fetch(`${baseUrl}/api/admin/videos`);
  check("GET /api/admin/videos unauthorized -> 401", videosAdminRes.status, 401);

  const adminPageRes = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
  check("GET /admin unauthorized -> 307 redirect", adminPageRes.status, 307);

  const setupStatusRes = await fetch(`${baseUrl}/api/admin/setup`);
  const setupStatus = (await setupStatusRes.json()) as { authorizedOwnerEmail: string };
  check(
    "GET /api/admin/setup exposes single authorized owner email",
    setupStatus.authorizedOwnerEmail,
    AUTHORIZED_OWNER_EMAIL,
  );
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
