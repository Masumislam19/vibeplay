import { useId } from "react";

/** Custom VibePlay brand mark: gradient rounded square with a play glyph. */
export function VibeMark({ className = "h-9 w-9" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" role="img">
      <defs>
        <linearGradient id={`vg-${id}`} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.55" stopColor="#a855f7" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="13" fill={`url(#vg-${id})`} />
      <rect x="3" y="3" width="42" height="42" rx="13" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <path d="M19.5 15.8v16.4c0 1.1 1.2 1.8 2.2 1.2l13.2-8.2c.9-.6.9-1.9 0-2.4L21.7 14.6c-1-.6-2.2.1-2.2 1.2z" fill="#ffffff" />
    </svg>
  );
}

export function VibeLogo({
  siteName = "VibePlay",
  markClass = "h-9 w-9",
  textClass = "text-xl",
  showTagline = false,
}: {
  siteName?: string;
  markClass?: string;
  textClass?: string;
  showTagline?: boolean;
}) {
  const name = siteName || "VibePlay";
  const splitAt = Math.max(1, Math.ceil(name.length / 2));
  const first = name.slice(0, splitAt);
  const rest = name.slice(splitAt);
  return (
    <span className="inline-flex items-center gap-2.5">
      <VibeMark className={markClass} />
      <span className={`font-display font-bold tracking-tight ${textClass}`}>
        <span className="vibe-text">{first}</span>
        <span className="text-white">{rest}</span>
      </span>
      {showTagline ? null : null}
    </span>
  );
}
