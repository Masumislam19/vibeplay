import Link from "next/link";
import { Database } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/** Honest notice shown on public pages when MONGODB_URI is not yet configured. */
export function DatabaseNotice({ error }: { error?: string | null }) {
  return (
    <div className="vibe-surface mx-auto max-w-2xl rounded-3xl border border-amber-500/25 bg-panel/80 px-6 py-12 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
        <Database className="h-6 w-6 text-amber-400" aria-hidden="true" />
      </div>
      <h2 className="font-display text-xl font-bold text-white">MongoDB Atlas not configured yet</h2>
      <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-zinc-400">
        {error ||
          "Set MONGODB_URI and MONGODB_DB_NAME=vibeplay in your environment variables (or Netlify Site configuration → Environment variables), then restart or redeploy."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/admin/setup" className={buttonClasses("outline", "md")}>
          Open setup checklist
        </Link>
      </div>
    </div>
  );
}
