import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isMongoConfigured } from "@/db";
import { DatabaseNotice } from "@/components/ui/db-notice";
import { EmptyState } from "@/components/videos/empty-state";
import { Pagination } from "@/components/videos/pagination";
import { SectionHeader } from "@/components/videos/section-header";
import { VideoGrid } from "@/components/videos/video-grid";
import { listCategoriesWithCounts, listVideos } from "@/server/services/videos";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!isMongoConfigured()) return { title: "Category" };
  const { slug } = await params;
  const categories = await listCategoriesWithCounts(true);
  const category = categories.find((c) => c.slug === slug);
  return { title: category ? category.name : "Category" };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  if (!isMongoConfigured()) return <DatabaseNotice />;
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const categories = await listCategoriesWithCounts(true);
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const result = await listVideos({ categorySlug: slug, page, limit: 12 });

  return (
    <div className="space-y-6">
      <SectionHeader
        title={category.name}
        hint={
          category.description ??
          `${category.videoCount} published ${category.videoCount === 1 ? "video" : "videos"}`
        }
      />
      {result.videos.length > 0 ? (
        <>
          <VideoGrid videos={result.videos} />
          <Pagination baseUrl={`/category/${slug}`} params={{}} page={result.page} totalPages={result.totalPages} />
        </>
      ) : (
        <EmptyState
          title={`No videos in ${category.name} yet`}
          hint="Publish a video with this category and it will appear here."
          actionHref="/explore"
          actionLabel="Explore everything"
        />
      )}
    </div>
  );
}
