"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

export function SearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore");
  }

  return (
    <form onSubmit={submit} className="relative w-full" role="search">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title or description…"
        aria-label="Search videos by title or description"
        className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-28 text-sm text-zinc-100 placeholder:text-zinc-500 transition focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-fuchsia-500 cursor-pointer"
      >
        Search
      </button>
    </form>
  );
}
