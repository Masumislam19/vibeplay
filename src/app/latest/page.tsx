import type { Metadata } from "next";
import { isMongoConfigured } from "@/db";
import { DatabaseNotice } from "@/components/ui/db-notice";
import { EmptyState } from "@/components/videos/empty-state";
import { Pagination } from "@/components/videos/pagination";
import { SectionHeader } from "@/components/videos/section-header";
import { VideoGrid } from "@/components/videos/video-grid";
import { listVideos } from "@/server/services/videos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Latest" };

export default async function LatestPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!isMongoConfigured()) return <DatabaseNotice />;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const result = await listVideos({ sort: "latest", page, limit: 12 });

  return (
    <div className="space-y-6">
      <SectionHeader title="Latest uploads" hint="Newest additions to the VibePlay catalog" />
      {result.videos.length > 0 ? (
        <>
          <VideoGrid videos={result.videos} />
          <Pagination baseUrl="/latest" params={{}} page={result.page} totalPages={result.totalPages} />
        </>
      ) : (
        <EmptyState
          title="No uploads yet"
          hint="Import and publish your first video from the Admin Dashboard."
          actionHref="/admin"
          actionLabel="Open Admin Dashboard"
        />
      )}
    </div>
  );
}
