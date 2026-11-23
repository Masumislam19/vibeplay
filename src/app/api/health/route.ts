import { pingMongo } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Health check for VibePlay + MongoDB Atlas.
 *
 * - If MONGODB_URI is not configured yet, returns HTTP 200 with an honest
 *   `configured: false` payload so the web runtime starts cleanly while clearly
 *   reporting that MongoDB Atlas still needs to be configured.
 * - If MONGODB_URI is configured, pings MongoDB and returns 200 when connected
 *   or 503 when unreachable.
 */
export async function GET() {
  const status = await pingMongo();
  if (!status.configured) {
    return Response.json(
      {
        ok: true,
        status: "unconfigured",
        database: {
          provider: "mongodb",
          configured: false,
          connected: false,
          dbName: status.dbName,
          message: status.error,
        },
      },
      { status: 200 },
    );
  }

  if (!status.connected) {
    return Response.json(
      {
        ok: false,
        status: "degraded",
        database: {
          provider: "mongodb",
          configured: true,
          connected: false,
          dbName: status.dbName,
          error: status.error,
        },
      },
      { status: 503 },
    );
  }

  return Response.json({
    ok: true,
    status: "healthy",
    database: {
      provider: "mongodb",
      configured: true,
      connected: true,
      dbName: status.dbName,
    },
  });
}
