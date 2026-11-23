"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/videos/video-card";
import type { VideoListItem } from "@/server/services/videos";

/**
 * Client-side "Load more" pagination for the homepage, backed by the public
 * /api/videos endpoint.
 */
export function LoadMoreVideos({
  sort = "latest",
  category,
  pageSize = 8,
}: {
  sort?: "latest" | "oldest" | "views" | "featured";
  category?: string;
  pageSize?: number;
}) {
  const [videos, setVideos] = useState<VideoListItem[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(pageSize), sort });
      if (category) params.set("category", category);
      const res = await fetch(`/api/videos?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { videos: VideoListItem[]; totalPages: number };
      setVideos((prev) => [...prev, ...body.videos]);
      if (nextPage >= body.totalPages) setExhausted(true);
      else setNextPage((p) => p + 1);
    } catch {
      setError("Could not load more videos. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {videos.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
      <div className="mt-8 flex flex-col items-center gap-3">
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {!exhausted ? (
          <Button variant="ghost" size="lg" onClick={loadMore} disabled={loading}>
            {loading ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
              </>
            ) : (
              "Load more videos"
            )}
          </Button>
        ) : (
          videos.length > 0 && <p className="text-sm text-zinc-600">You have reached the end.</p>
        )}
      </div>
    </>
  );
}
