"use client";

import { useEffect, useRef } from "react";

/**
 * Fires a single local view-count request per page load. The server dedupes
 * one view per viewer per video per day via a privacy-preserving hash.
 */
export function ViewTracker({ videoId }: { videoId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const timer = setTimeout(() => {
      fetch(`/api/videos/${videoId}/view`, { method: "POST", keepalive: true }).catch(() => {
        /* view tracking is best-effort */
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [videoId]);

  return null;
}
