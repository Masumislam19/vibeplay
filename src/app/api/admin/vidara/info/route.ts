import { handleRoute, jsonOk } from "@/server/lib/http";
import { requireAdminOrThrow } from "@/server/services/auth";
import { getAccountInfo, getUploadServer, isVidaraConfigured } from "@/server/services/vidara";

export const dynamic = "force-dynamic";

/** Server-side Vidara account lookup: username, premium, storage, totals, upload server. */
export async function GET() {
  return handleRoute(async () => {
    await requireAdminOrThrow();

    if (!isVidaraConfigured()) {
      return jsonOk({
        configured: false,
        account: null,
        uploadServer: null,
        error: "VIDARA_API_KEY is not configured on the server.",
      });
    }

    try {
      const account = await getAccountInfo();
      let uploadServer: string | null = null;
      try {
        uploadServer = await getUploadServer();
      } catch {
        uploadServer = null;
      }
      return jsonOk({ configured: true, account, uploadServer, error: null });
    } catch (error) {
      return jsonOk(
        {
          configured: true,
          account: null,
          uploadServer: null,
          error: error instanceof Error ? error.message : "Vidara account lookup failed.",
        },
        200,
      );
    }
  });
}
