import { isMongoConfigured } from "@/db";
import { getSettings } from "@/server/services/settings";
import { getTrendingVideos, listCategoriesWithCounts, listVideos } from "@/server/services/videos";
import { AdSlot } from "@/components/ads/ad-slot";
import { DatabaseNotice } from "@/components/ui/db-notice";
import { CategoryCard } from "@/components/videos/category-card";
import { EmptyState } from "@/components/videos/empty-state";
import { FeaturedHero } from "@/components/videos/featured-hero";
import { LoadMoreVideos } from "@/components/videos/load-more";
import { SectionHeader } from "@/components/videos/section-header";
import { VideoGrid } from "@/components/videos/video-grid";


export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getSettings();
  if (!isMongoConfigured()) {
    return <DatabaseNotice />;
  }

  const featuredResult = await listVideos({ featuredOnly: true, sort: "latest", limit: 1 });
  let featured = featuredResult.videos[0] ?? null;
  if (!featured) {
    const topViewed = await listVideos({ sort: "views", limit: 1 });
    featured = topViewed.videos[0] ?? null;
  }

  const [trending, latest, categories] = await Promise.all([
    getTrendingVideos(8),
    listVideos({ sort: "latest", limit: 8 }),
    listCategoriesWithCounts(true),
  ]);

  const hasVideos = latest.total > 0;

  return (
    <div className="space-y-12">
      {featured ? (
        <FeaturedHero video={featured} />
      ) : (
        <EmptyState
          title="No videos yet"
          hint={
            hasVideos
              ? undefined
              : "Sign in to the Admin Dashboard to upload your first MP4 video. Everything you publish appears here instantly."
          }
          actionHref="/admin"
          actionLabel="Open Admin Dashboard"
          
        />
      )}
      <AdSlot
  settings={settings}
  slot="adHomeHtml"
  className="w-full"
/>

      {/* <AdSlot settings={settings} slot="adHomeHtml" /> */}

      {hasVideos && (
        <section aria-label="Latest uploads">
          <SectionHeader
            title="Latest uploads"
            hint="Fresh from the VibePlay catalog"
            actionHref="/latest"
            actionLabel="View all"
          />
          <VideoGrid videos={latest.videos} />
          {latest.total > 8 && (
            <div className="mt-10">
              <LoadMoreVideos sort="latest" pageSize={8} />
            </div>
          )}
        </section>
      )}

      {trending.length > 0 && (
        <section aria-label="Trending videos">
          <SectionHeader
            title="Trending now"
            hint="Most-watched on VibePlay in the last 7 days"
            actionHref="/trending"
            actionLabel="View all"
          />
          <VideoGrid videos={trending} />
        </section>
      )}

      {categories.length > 0 && (
        <section aria-label="Popular categories">
          <SectionHeader
            title="Popular categories"
            hint="Jump straight into what you love"
            actionHref="/categories"
            actionLabel="All categories"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((category, index) => (
              <CategoryCard
                key={category.id}
                slug={category.slug}
                name={category.name}
                videoCount={category.videoCount}
                index={index}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
