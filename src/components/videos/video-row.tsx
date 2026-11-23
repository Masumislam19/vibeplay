import Link from "next/link";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import { VibeMark } from "@/components/logo";
import type { VideoListItem } from "@/server/services/videos";

/** Compact horizontal card used in the related-videos sidebar. */
export function VideoRow({ video }: { video: VideoListItem }) {
  const duration = formatDuration(video.durationSeconds);
  return (
    <Link
      href={`/watch/${video.id}`}
      className="group flex gap-3 rounded-xl border border-white/5 bg-panel/60 p-2 transition hover:border-violet-500/30 hover:bg-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
    >
      <div className="relative h-[68px] w-28 shrink-0 overflow-hidden rounded-lg bg-raised">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="vibe-surface flex h-full w-full items-center justify-center">
            <VibeMark className="h-6 w-6 opacity-60" />
          </div>
        )}
        {duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[10px] font-semibold text-white tabular-nums">
            {duration}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-200 transition group-hover:text-violet-300">
          {video.title}
        </h3>
        <p className="mt-1 text-[11px] text-zinc-500">
          {formatViews(video.views)} views · {timeAgo(video.createdAt)}
        </p>
        {video.categoryName && <p className="mt-0.5 truncate text-[11px] text-cyan-400/80">{video.categoryName}</p>}
      </div>
    </Link>
  );
}
