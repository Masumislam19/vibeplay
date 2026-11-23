import Link from "next/link";
import { Mail } from "lucide-react";
import { VibeLogo } from "@/components/logo";
import type { SiteSettings } from "@/server/services/settings";

/* Lightweight brand glyphs (lucide-react no longer ships brand icons). */
function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function YouTubeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12z" />
    </svg>
  );
}

function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-white/5 bg-abyss/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <VibeLogo siteName={settings.siteName} markClass="h-9 w-9" textClass="text-xl" />
          <p className="max-w-sm text-sm leading-relaxed text-zinc-500">
            {settings.siteDescription}
          </p>
          <p className="text-xs leading-relaxed text-zinc-600">
            Videos and thumbnails are hosted in Supabase Storage and played natively inside VibePlay.
          </p>
        </div>

        <nav aria-label="Browse">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-300">Browse</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              { href: "/", label: "Home" },
              { href: "/explore", label: "Explore" },
              { href: "/categories", label: "Categories" },
              { href: "/trending", label: "Trending" },
              { href: "/latest", label: "Latest" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-zinc-500 transition hover:text-violet-300">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-6">
          <nav aria-label="Legal">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-300">Legal</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                { href: "/legal/terms", label: "Terms & Conditions" },
                { href: "/legal/privacy", label: "Privacy Policy" },
                { href: "/legal/copyright", label: "Copyright Policy" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-zinc-500 transition hover:text-violet-300">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-zinc-300">Connect</h3>
            <div className="mt-4 flex items-center gap-2.5">
              {settings.contactEmail && (
                <a
                  href={`mailto:${settings.contactEmail}`}
                  aria-label="Email contact"
                  className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-violet-500/40 hover:text-violet-300"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {settings.socialTwitter && (
                <a href={settings.socialTwitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter / X" className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-violet-500/40 hover:text-violet-300">
                  <XIcon />
                </a>
              )}
              {settings.socialYoutube && (
                <a href={settings.socialYoutube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-violet-500/40 hover:text-violet-300">
                  <YouTubeIcon />
                </a>
              )}
              {settings.socialInstagram && (
                <a href={settings.socialInstagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-violet-500/40 hover:text-violet-300">
                  <InstagramIcon />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 py-5 text-center text-xs text-zinc-600">
        © {year} {settings.siteName}. All rights reserved. Media hosted via Supabase Storage — the
        platform owner is responsible for the rights to all published material.
      </div>
    </footer>
  );
}
