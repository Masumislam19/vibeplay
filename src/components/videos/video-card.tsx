import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { VibeMark } from "@/components/logo";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import type { VideoListItem } from "@/server/services/videos";

export function VideoCard({ video }: { video: VideoListItem }) {
  const duration = formatDuration(video.durationSeconds);
  return (
    <Link
      href={`/watch/${video.id}`}
      className="card-hover group block overflow-hidden rounded-2xl border border-white/8 bg-panel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
    >
      <div className="relative aspect-video overflow-hidden rounded-t-2xl bg-raised">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt={`Thumbnail for ${video.title}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="vibe-surface flex h-full w-full items-center justify-center">
            <VibeMark className="h-10 w-10 opacity-60" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" aria-hidden="true" />

        {video.categoryName && (
          <span className="absolute left-2.5 top-2.5">
            <Badge tone="violet">{video.categoryName}</Badge>
          </span>
        )}
        {video.ageRestricted && (
          <span className="absolute right-2.5 top-2.5">
            <Badge tone="red">18+</Badge>
          </span>
        )}
        {duration && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
            {duration}
          </span>
        )}
      </div>

      <div className="space-y-1.5 px-3.5 pb-4 pt-3">
        <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-snug text-zinc-100 transition-colors group-hover:text-violet-300">
          {video.title}
        </h3>
        <p className="text-xs text-zinc-500">
          {formatViews(video.views)} views · {timeAgo(video.createdAt)}
          {video.featured ? " · Featured" : ""}
        </p>
      </div>
    </Link>
  );
}
