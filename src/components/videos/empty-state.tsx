import Link from "next/link";
import { Film } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export function EmptyState({
  title,
  hint,
  actionHref,
  actionLabel,
}: {
  title: string;
  hint?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="vibe-surface flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
      <div className="pulse-ring mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10">
        <Film className="h-7 w-7 text-violet-400" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg font-bold text-white">{title}</h3>
      {hint && <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">{hint}</p>}
      {actionHref && actionLabel && (
        <Link href={actionHref} className={`${buttonClasses("outline", "md")} mt-6`}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
