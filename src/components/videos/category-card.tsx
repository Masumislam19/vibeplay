import Link from "next/link";
import { Clapperboard, Dumbbell, Gamepad2, Globe2, GraduationCap, Music2, Newspaper, Palette, Rocket, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: LucideIcon[] = [Clapperboard, Music2, Gamepad2, GraduationCap, Globe2, Newspaper, Rocket, Palette, Dumbbell, UtensilsCrossed];

export function CategoryCard({
  slug,
  name,
  videoCount,
  index,
}: {
  slug: string;
  name: string;
  videoCount: number;
  index: number;
}) {
  const Icon = ICONS[index % ICONS.length];
  return (
    <Link
      href={`/category/${slug}`}
      className="card-hover group flex items-center gap-4 rounded-2xl border border-white/8 bg-panel/70 px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/25 to-cyan-500/20 text-violet-300 transition group-hover:from-violet-500/40 group-hover:text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display font-semibold text-zinc-100 group-hover:text-violet-200">{name}</span>
        <span className="text-xs text-zinc-500">
          {videoCount} {videoCount === 1 ? "video" : "videos"}
        </span>
      </span>
    </Link>
  );
}
