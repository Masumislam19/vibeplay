import { VideoCard } from "@/components/videos/video-card";
import type { VideoListItem } from "@/server/services/videos";

export function VideoGrid({ videos }: { videos: VideoListItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((video, index) => (
        <div key={video.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
          <VideoCard video={video} />
        </div>
      ))}
    </div>
  );
}
