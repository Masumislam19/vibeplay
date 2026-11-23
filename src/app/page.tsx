
import Link from "next/link";

import { isMongoConfigured } from "@/db";
import { getSettings } from "@/server/services/settings";
import {
  getTrendingVideos,
  listCategoriesWithCounts,
  listVideos,
} from "@/server/services/videos";

import { AdSlot } from "@/components/ads/ad-slot";
import { DatabaseNotice } from "@/components/ui/db-notice";
import { CategoryCard } from "@/components/videos/category-card";
import { EmptyState } from "@/components/videos/empty-state";
import { FeaturedHero } from "@/components/videos/featured-hero";
import { LoadMoreVideos } from "@/components/videos/load-more";
import { SectionHeader } from "@/components/videos/section-header";
import { VideoGrid } from "@/components/videos/video-grid";

export const dynamic = "force-dynamic";

const SMARTLINK_URL = "https://thoroughgear.com/pRiVYF";

/**
 * Reusable action buttons for homepage sections.
 */
function SectionActions({ seeMoreHref }: { seeMoreHref: string }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <Link
        href={seeMoreHref}
        className="inline-flex min-w-32 items-center justify-center rounded-full bg-violet-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500 hover:shadow-violet-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        See More
      </Link>

      <a
        href={SMARTLINK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-32 items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 py-3 text-sm font-semibold text-white transition hover:border-violet-400/50 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        See Later
      </a>
    </div>
  );
}

export default async function HomePage() {
  const settings = await getSettings();

  if (!isMongoConfigured()) {
    return <DatabaseNotice />;
  }

  const featuredResult = await listVideos({
    featuredOnly: true,
    sort: "latest",
    limit: 1,
  });

  let featured = featuredResult.videos[0] ?? null;

  if (!featured) {
    const topViewed = await listVideos({
      sort: "views",
      limit: 1,
    });

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
      {/* Featured Hero */}
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

      {/* Homepage Advertisement */}
      <AdSlot
        settings={settings}
        slot="adHomeHtml"
        className="w-full"
      />

      {/* Latest Uploads */}
      {hasVideos && (
        <section aria-label="Latest uploads">
          <SectionHeader
            title="Latest uploads"
            hint="Fresh from the VibePlay catalog"
          />

          <VideoGrid videos={latest.videos} />

          {latest.total > 8 && (
            <div className="mt-10">
              <LoadMoreVideos sort="latest" pageSize={8} />
            </div>
          )}

          <SectionActions seeMoreHref="/latest" />
        </section>
      )}

      {/* Trending Videos */}
      {trending.length > 0 && (
        <section aria-label="Trending videos">
          <SectionHeader
            title="Trending now"
            hint="Most-watched on VibePlay in the last 7 days"
          />

          <VideoGrid videos={trending} />

          <SectionActions seeMoreHref="/trending" />
        </section>
      )}

      {/* Popular Categories */}
      {categories.length > 0 && (
        <section aria-label="Popular categories">
          <SectionHeader
            title="Popular categories"
            hint="Jump straight into what you love"
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

          <SectionActions seeMoreHref="/categories" />
        </section>
      )}
    </div>
  );
}