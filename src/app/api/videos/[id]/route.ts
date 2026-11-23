import { handleRoute, jsonError, jsonOk } from "@/server/lib/http";
import { getVideoById, toPublicVideo } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** Public video details by internal id (never exposes draft paths or internal storage details). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const video = await getVideoById(id, true);
    if (!video || video.storageProvider !== "supabase" || !video.videoUrl) {
      return jsonError(404, "Video not found.");
    }
    return jsonOk(toPublicVideo(video));
  });
}
