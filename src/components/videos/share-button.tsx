"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export function ShareButton({ videoId, title }: { videoId: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/watch/${videoId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy link to ${title}`}
      className={buttonClasses("ghost", "md") + " cursor-pointer"}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" /> Copied
        </>
      ) : (
        <>
          <Link2 className="h-4 w-4" aria-hidden="true" /> Share
        </>
      )}
    </button>
  );
}
