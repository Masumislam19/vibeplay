import { handleRoute, HttpError, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import { requireAdminOrThrow } from "@/server/services/auth";
import { saveVideoThumbnail } from "@/server/services/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512 * 1024;

/**
 * Persists a browser-extracted JPEG/WebP thumbnail frame into MongoDB
 * (`video_thumbnails` collection) for the given video ID.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdminOrThrow();
    const ip = getClientIp(req);
    await enforceRateLimit("thumbnail_upload", ip, 40, 60 * 60 * 1000);

    const { id } = await params;
    const contentLength = Number.parseInt(req.headers.get("content-length") ?? "0", 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new HttpError(413, "Thumbnail exceeds the 512 KB maximum size.");
    }

    const arrayBuffer = await req.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const widthRaw = Number.parseInt(req.headers.get("x-thumb-width") ?? "", 10);
    const heightRaw = Number.parseInt(req.headers.get("x-thumb-height") ?? "", 10);

    const saved = await saveVideoThumbnail(
      id,
      bytes,
      {
        width: Number.isFinite(widthRaw) ? widthRaw : null,
        height: Number.isFinite(heightRaw) ? heightRaw : null,
      },
      { adminId: admin.id, ip },
    );

    return jsonOk(saved, 200);
  });
}
