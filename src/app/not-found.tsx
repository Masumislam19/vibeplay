import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { VibeMark } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="pulse-ring flex h-20 w-20 items-center justify-center rounded-3xl bg-violet-500/10">
        <VibeMark className="h-10 w-10" />
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold text-white">404 — lost the vibe</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          This page does not exist or the video is no longer published. Explore the catalog to find
          something new.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/" className={buttonClasses("primary", "md")}>
          Back to home
        </Link>
        <Link href="/explore" className={buttonClasses("ghost", "md")}>
          Explore videos
        </Link>
      </div>
    </div>
  );
}
