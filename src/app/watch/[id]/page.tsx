import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Eye } from "lucide-react";
import { AdSlot } from "@/components/ads/ad-slot";
import { Badge } from "@/components/ui/badge";
import { DescriptionBlock } from "@/components/videos/description-block";
import { ReportDialog } from "@/components/videos/report-dialog";
import { ShareButton } from "@/components/videos/share-button";
import { VideoRow } from "@/components/videos/video-row";
import { ViewTracker } from "@/components/videos/view-tracker";
import { VibePlayPlayer } from "@/components/player/vibeplay-player";
import { isMongoConfigured } from "@/db";
import { DatabaseNotice } from "@/components/ui/db-notice";
import { formatDate, formatViews } from "@/lib/format";
import { getSettings } from "@/server/services/settings";
import { getRelatedVideos, getVideoById } from "@/server/services/videos";

export const dynamic = "force-dynamic";

interface WatchProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: WatchProps): Promise<Metadata> {
  if (!isMongoConfigured()) return { title: "Watch" };
  const { id } = await params;
  const video = await getVideoById(id, true);
  if (!video || video.storageProvider !== "supabase" || !video.videoUrl) {
    return { title: "Video not found" };
  }
  return {
    title: video.title,
    description: video.description ?? undefined,
    openGraph: {
      title: video.title,
      description: video.description ?? undefined,
      images: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
    },
  };
}

export default async function WatchPage({ params }: WatchProps) {
  if (!isMongoConfigured()) return <DatabaseNotice />;
  const { id } = await params;
  const video = await getVideoById(id, true);
  if (!video) notFound();

  const [settings, related] = await Promise.all([getSettings(), getRelatedVideos(video, 12)]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <ViewTracker videoId={video.id} />

      <div className="min-w-0 space-y-5">
        <VibePlayPlayer
          videoId={video.id}
          title={video.title}
          storageProvider={video.storageProvider}
          videoUrl={video.videoUrl}
          thumbnailUrl={video.thumbnailUrl}
          ageRestricted={video.ageRestricted}
          ageGateEnabled={settings.ageGateEnabled}
          autoPlay
        />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {video.categoryName && video.categorySlug && (
              <Link href={`/category/${video.categorySlug}`}>
                <Badge tone="cyan">{video.categoryName}</Badge>
              </Link>
            )}
            {video.featured && <Badge tone="purple">Featured</Badge>}
            {video.ageRestricted && <Badge tone="red">18+</Badge>}
          </div>

          <h1 className="font-display text-xl font-bold leading-snug text-white sm:text-2xl">
            {video.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-violet-400" aria-hidden="true" />
              {formatViews(video.views)} views
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              {formatDate(video.createdAt)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <ShareButton videoId={video.id} title={video.title} />
            <ReportDialog videoId={video.id} />
          </div>

          {video.description && (
            <div className="rounded-2xl border border-white/8 bg-panel/70 px-5 py-4">
              <DescriptionBlock text={video.description} />
            </div>
          )}
        </div>

        <AdSlot settings={settings} slot="adWatchHtml" />
      </div>

      <aside className="min-w-0 space-y-4" aria-label="Related videos">
        <h2 className="font-display text-lg font-bold text-white">
          Up next<span className="vibe-text">.</span>
        </h2>
        {related.length > 0 ? (
          <div className="space-y-3">
            {related.map((item) => (
              <VideoRow key={item.id} video={item} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
            No related videos yet. Publish more content to build up this queue.
          </p>
        )}
        <AdSlot settings={settings} slot="adListHtml" />
      </aside>
    </div>
  );
}
