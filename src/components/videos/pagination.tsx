import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function buildHref(baseUrl: string, params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `${baseUrl}?${qs}` : baseUrl;
}

function pageWindow(current: number, total: number): number[] {
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  return [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
}

/** Server-rendered pagination that preserves the current query params. */
export function Pagination({
  baseUrl,
  params,
  page,
  totalPages,
}: {
  baseUrl: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(page, totalPages);

  const linkClass = (active: boolean) =>
    `inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-sm font-semibold transition ${
      active
        ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-950/40"
        : "border border-white/10 bg-white/5 text-zinc-300 hover:border-violet-500/40 hover:text-violet-300"
    }`;

  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="Pagination">
      {page > 1 && (
        <Link href={buildHref(baseUrl, params, page - 1)} aria-label="Previous page" className={linkClass(false)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-zinc-600">…</span>}
          <Link href={buildHref(baseUrl, params, p)} aria-current={p === page ? "page" : undefined} className={linkClass(p === page)}>
            {p}
          </Link>
        </span>
      ))}
      {page < totalPages && (
        <Link href={buildHref(baseUrl, params, page + 1)} aria-label="Next page" className={linkClass(false)}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}
