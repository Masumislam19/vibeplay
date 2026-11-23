import { handleRoute, jsonOk } from "@/server/lib/http";
import { requireAdminOrThrow } from "@/server/services/auth";
import { listVideos, type SortOption, type VideoListItem } from "@/server/services/videos";
import type { StorageProvider } from "@/db";

export const dynamic = "force-dynamic";

const SORTS: SortOption[] = ["latest", "oldest", "views", "featured"];

/** Full video management list (includes drafts and legacy unmigrated records). */
export async function GET(req: Request) {
  return handleRoute(async () => {
    await requireAdminOrThrow();
    const params = new URL(req.url).searchParams;
    const storageParam = params.get("storage");
    const storageFilter: StorageProvider | undefined =
      storageParam === "supabase" || storageParam === "legacy" ? storageParam : undefined;

    const sortParam = params.get("sort") as SortOption | null;
    const result = await listVideos({
      q: params.get("q")?.trim() || undefined,
      categorySlug: params.get("category")?.trim() || undefined,
      sort: sortParam && SORTS.includes(sortParam) ? sortParam : "latest",
      page: Number.parseInt(params.get("page") ?? "1", 10) || 1,
      limit: Number.parseInt(params.get("limit") ?? "24", 10) || 24,
      publishedOnly: false,
      storageFilter,
    });

    const payload: { videos: VideoListItem[]; total: number; page: number; totalPages: number } = {
      videos: result.videos,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    };
    return jsonOk(payload);
  });
}
