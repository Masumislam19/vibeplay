import { handleRoute, jsonOk } from "@/server/lib/http";
import { requireAdminOrThrow } from "@/server/services/auth";
import { listReports } from "@/server/services/videos";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleRoute(async () => {
    await requireAdminOrThrow();
    const params = new URL(req.url).searchParams;
    const status = params.get("status") ?? undefined;
    const result = await listReports({
      status: status && ["open", "resolved", "dismissed"].includes(status) ? status : undefined,
      page: Number.parseInt(params.get("page") ?? "1", 10) || 1,
      limit: Number.parseInt(params.get("limit") ?? "20", 10) || 20,
    });
    return jsonOk(result);
  });
}
