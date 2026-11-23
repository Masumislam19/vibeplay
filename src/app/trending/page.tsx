import type { Metadata } from "next";
import { isMongoConfigured } from "@/db";
import { DatabaseNotice } from "@/components/ui/db-notice";
import { EmptyState } from "@/components/videos/empty-state";
import { SectionHeader } from "@/components/videos/section-header";
import { VideoGrid } from "@/components/videos/video-grid";
import { getTrendingVideos } from "@/server/services/videos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Trending" };

export default async function TrendingPage() {
  if (!isMongoConfigured()) return <DatabaseNotice />;
  const trending = await getTrendingVideos(24);
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Trending now"
        hint="The most-watched videos on VibePlay over the last 7 days"
      />
      {trending.length > 0 ? (
        <VideoGrid videos={trending} />
      ) : (
        <EmptyState
          title="No trends yet"
          hint="Once videos start collecting views, the hottest ones rise here."
          actionHref="/explore"
          actionLabel="Explore the catalog"
        />
      )}
    </div>
  );
}
