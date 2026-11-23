import Link from "next/link";
import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { isMongoConfigured } from "@/db";
import { DatabaseNotice } from "@/components/ui/db-notice";
import { EmptyState } from "@/components/videos/empty-state";
import { Pagination } from "@/components/videos/pagination";
import { SearchBar } from "@/components/videos/search-bar";
import { SectionHeader } from "@/components/videos/section-header";
import { VideoGrid } from "@/components/videos/video-grid";
import { listCategoriesWithCounts, listVideos, type SortOption } from "@/server/services/videos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Explore" };

const SORTS: Array<{ value: SortOption; label: string }> = [
  { value: "latest", label: "Latest" },
  { value: "views", label: "Most viewed" },
  { value: "featured", label: "Featured" },
  { value: "oldest", label: "Oldest" },
];

interface ExploreSearchParams {
  q?: string;
  category?: string;
  sort?: string;
  page?: string;
}

function exploreHref(params: ExploreSearchParams, overrides: Partial<ExploreSearchParams>): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  if (merged.q) search.set("q", merged.q);
  if (merged.category) search.set("category", merged.category);
  if (merged.sort && merged.sort !== "latest") search.set("sort", merged.sort);
  if (merged.page && merged.page !== "1") search.set("page", merged.page);
  const qs = search.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<ExploreSearchParams> }) {
  if (!isMongoConfigured()) return <DatabaseNotice />;
  const sp = await searchParams;
  const sort: SortOption = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as SortOption) : "latest";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [categories, result] = await Promise.all([
    listCategoriesWithCounts(true),
    listVideos({ q: sp.q, categorySlug: sp.category, sort, page, limit: 12, publishedOnly: true }),
  ]);

  const activeCategory = categories.find((c) => c.slug === sp.category);
  const hasFilters = Boolean(sp.q || sp.category || (sp.sort && sp.sort !== "latest"));

  return (
    <div className="space-y-8">
      <div>
        <SectionHeader
          title="Explore"
          hint={sp.q ? `Search results for “${sp.q}”` : "Search, filter and sort the full VibePlay catalog"}
        />
        <SearchBar initialQuery={sp.q ?? ""} />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <Link
            href={exploreHref(sp, { category: undefined, page: undefined })}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              !sp.category
                ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-violet-500/40 hover:text-violet-300"
            }`}
          >
            All categories
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={exploreHref(sp, { category: c.slug, page: undefined })}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                sp.category === c.slug
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:border-violet-500/40 hover:text-violet-300"
              }`}
            >
              {c.name} <span className="text-zinc-500">{c.videoCount}</span>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort videos">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Sort</span>
          {SORTS.map((s) => (
            <Link
              key={s.value}
              href={exploreHref(sp, { sort: s.value, page: undefined })}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                sort === s.value
                  ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:border-cyan-500/40 hover:text-cyan-300"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {result.videos.length > 0 ? (
        <>
          <p className="text-sm text-zinc-500" aria-live="polite">
            {result.total} {result.total === 1 ? "video" : "videos"}
            {activeCategory ? ` in ${activeCategory.name}` : ""}
            {hasFilters ? "" : " on VibePlay"}
          </p>
          <VideoGrid videos={result.videos} />
          <Pagination
            baseUrl="/explore"
            params={{ q: sp.q, category: sp.category, sort: sort !== "latest" ? sort : undefined }}
            page={result.page}
            totalPages={result.totalPages}
          />
        </>
      ) : (
        <EmptyState
          title={sp.q ? `No results for “${sp.q}”` : "Nothing here yet"}
          hint={
            sp.q
              ? "Try a different search term or clear the filters to browse everything."
              : "Videos will appear here as soon as they are published."
          }
          actionHref={sp.q || sp.category ? exploreHref({}, {}) : undefined}
          actionLabel={sp.q || sp.category ? "Clear filters" : undefined}
        />
      )}
    </div>
  );
}
