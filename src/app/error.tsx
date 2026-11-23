"use client";

import { useEffect } from "react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[vibeplay] page error:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
        <TriangleAlert className="h-7 w-7 text-red-400" aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          An unexpected error occurred. This has been logged — please try again.
        </p>
      </div>
      <button type="button" onClick={reset} className={buttonClasses("primary", "md") + " cursor-pointer"}>
        <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Try again
      </button>
    </div>
  );
}
