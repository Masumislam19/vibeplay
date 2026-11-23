import { handleRoute, jsonOk } from "@/server/lib/http";
import { listCategoriesWithCounts } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** Public categories with published video counts. */
export async function GET(req: Request) {
  return handleRoute(async () => {
    const includeUnpublished = new URL(req.url).searchParams.get("all") === "1";
    const categories = await listCategoriesWithCounts(!includeUnpublished);
    return jsonOk({ categories });
  });
}
