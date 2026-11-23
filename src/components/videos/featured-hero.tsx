import Link from "next/link";
import { CalendarDays, Eye, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, formatDuration, formatViews } from "@/lib/format";
import { VibeMark } from "@/components/logo";
import type { VideoListItem } from "@/server/services/videos";

/** Cinematic full-width banner for the featured video. */
export function FeaturedHero({ video }: { video: VideoListItem }) {
  const duration = formatDuration(video.durationSeconds);
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-panel animate-fade-up" aria-label="Featured video">
      <div className="absolute inset-0">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt="" className="h-full w-full scale-105 object-cover opacity-40 blur-[2px]" />
        ) : (
          <div className="vibe-surface h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-void via-void/80 to-void/20" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-void via-transparent to-transparent" aria-hidden="true" />
      </div>

      <div className="relative flex min-h-[380px] flex-col justify-end gap-4 px-6 py-8 sm:px-10 sm:py-10 lg:min-h-[440px]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="purple">
            <Sparkles className="h-3 w-3" aria-hidden="true" /> Featured
          </Badge>
          {video.categoryName && <Badge tone="cyan">{video.categoryName}</Badge>}
          {video.ageRestricted && <Badge tone="red">18+</Badge>}
        </div>

        <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
          {video.title}
        </h1>

        {video.description && (
          <p className="max-w-2xl line-clamp-2 text-sm leading-relaxed text-zinc-400 sm:text-base">
            {video.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-violet-400" aria-hidden="true" /> {formatViews(video.views)} views
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-cyan-400" aria-hidden="true" /> {formatDate(video.createdAt)}
          </span>
          {duration && <span className="tabular-nums">{duration}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href={`/watch/${video.id}`} className={buttonClasses("primary", "lg")}>
            <Play className="h-5 w-5 fill-current" aria-hidden="true" /> Watch now
          </Link>
          <Link href="/trending" className={buttonClasses("ghost", "lg")}>
            Browse trending
          </Link>
        </div>
      </div>

      <div className="pointer-events-none absolute right-6 top-6 hidden opacity-25 lg:block" aria-hidden="true">
        <VibeMark className="h-16 w-16" />
      </div>
    </section>
  );
}
