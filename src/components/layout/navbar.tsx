"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Search, Shield, X } from "lucide-react";
import { VibeLogo } from "@/components/logo";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/categories", label: "Categories" },
  { href: "/trending", label: "Trending" },
  { href: "/latest", label: "Latest" },
];

export function Navbar({ siteName, logoUrl }: { siteName: string; logoUrl: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore");
    setMenuOpen(false);
  }

  function renderBrand() {
    if (logoUrl) {
      return (
        <span className="inline-flex items-center gap-2.5">
          {/* Owner-configured logo from Admin Settings */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={`${siteName} logo`} className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-display text-xl font-bold tracking-tight text-white">{siteName}</span>
        </span>
      );
    }
    return <VibeLogo siteName={siteName} />;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 glass">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6" aria-label="Main navigation">
        <Link href="/" className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60">
          {renderBrand()}
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "bg-violet-500/15 text-violet-200"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2.5">
          <form onSubmit={submitSearch} className="relative hidden md:block" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos…"
              aria-label="Search videos"
              className="w-56 rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 transition focus:w-72 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </form>

          <Link
            href="/admin"
            className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:border-violet-500/40 hover:text-violet-300 sm:inline-flex"
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            Admin
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="border-t border-white/5 bg-abyss/95 backdrop-blur lg:hidden animate-fade-in">
          <div className="mx-auto max-w-7xl space-y-1 px-4 py-4 sm:px-6">
            <form onSubmit={submitSearch} className="relative mb-3" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search videos…"
                aria-label="Search videos"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </form>
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive(link.href) ? "bg-violet-500/15 text-violet-200" : "text-zinc-300 hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-medium text-zinc-300 hover:border-violet-500/40"
            >
              <Shield className="h-4 w-4" aria-hidden="true" /> Admin Dashboard
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
