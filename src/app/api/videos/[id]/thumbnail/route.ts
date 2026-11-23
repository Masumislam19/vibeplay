import { NextResponse } from "next/server";
import { isMongoConfigured } from "@/db";
import { requireAdmin } from "@/server/services/auth";
import { getVideoThumbnailForRequest } from "@/server/services/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves thumbnails safely:
 * - Never exposes draft object paths/URLs to unauthenticated visitors.
 * - Redirects to the public Supabase Storage thumbnail URL with cache headers.
 * - Preserves read-only serving for legacy MongoDB-stored thumbnails until replaced.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  try {
    const { id } = await params;
    const admin = await requireAdmin().catch(() => null);
    const result = await getVideoThumbnailForRequest(id, Boolean(admin));

    if (result.kind === "none") {
      return NextResponse.json({ error: "Thumbnail not found." }, { status: 404 });
    }

    if (result.kind === "redirect") {
      return NextResponse.redirect(result.url, {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }

    const ifNoneMatch = req.headers.get("if-none-match");
    const hasVersionParam = new URL(req.url).searchParams.has("v");
    const cacheControl = hasVersionParam
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600, stale-while-revalidate=86400";

    if (ifNoneMatch && ifNoneMatch === result.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.bytes.length),
        ETag: result.etag,
        "Last-Modified": result.updatedAt.toUTCString(),
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "[vibeplay] thumbnail serve error:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ error: "Could not load thumbnail." }, { status: 500 });
  }
}
