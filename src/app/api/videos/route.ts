import { handleRoute, jsonOk } from "@/server/lib/http";
import { listVideos, toPublicVideo, type SortOption } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const SORTS: SortOption[] = ["latest", "oldest", "views", "featured"];

/** Public video catalog: search, category filter, sorting, pagination. */
export async function GET(req: Request) {
  return handleRoute(async () => {
    const params = new URL(req.url).searchParams;
    const q = params.get("q")?.trim() || undefined;
    const categorySlug = params.get("category")?.trim() || undefined;
    const sortParam = params.get("sort") as SortOption | null;
    const sort: SortOption = sortParam && SORTS.includes(sortParam) ? sortParam : "latest";
    const page = Number.parseInt(params.get("page") ?? "1", 10) || 1;
    const limit = Number.parseInt(params.get("limit") ?? "12", 10) || 12;

    const result = await listVideos({ q, categorySlug, sort, page, limit, publishedOnly: true });
    return jsonOk({
      ...result,
      videos: result.videos.map(toPublicVideo),
    });
  });
}
