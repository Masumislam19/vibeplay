import { handleRoute, jsonError, jsonOk } from "@/server/lib/http";
import { getRelatedVideos, getVideoById, toPublicVideo } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** Related published videos (same category first, then top viewed). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const video = await getVideoById(id, true);
    if (!video) return jsonError(404, "Video not found.");
    const related = await getRelatedVideos(video, 12);
    return jsonOk({ videos: related.map(toPublicVideo) });
  });
}
