import type { ReactNode } from "react";

export type BadgeTone = "violet" | "cyan" | "zinc" | "green" | "amber" | "red" | "purple";

const tones: Record<BadgeTone, string> = {
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  zinc: "bg-white/8 text-zinc-300 border-white/15",
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function Badge({
  children,
  tone = "violet",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
