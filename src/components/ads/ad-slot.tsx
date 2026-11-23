// import type { SiteSettings } from "@/server/services/settings";

// type AdSlotKey = "adHomeHtml" | "adListHtml" | "adWatchHtml";

// const labels: Record<AdSlotKey, string> = {
//   adHomeHtml: "Advertisement",
//   adListHtml: "Sponsored",
//   adWatchHtml: "Advertisement",
// };

// /**
//  * Optional advertisement slot. Disabled by default; renders owner-configured
//  * scripts only when the global ad toggle and the slot content are both set.
//  */
// export function AdSlot({ settings, slot, className = "" }: { settings: SiteSettings; slot: AdSlotKey; className?: string }) {
//   if (!settings.adsEnabled) return null;
//   const html = settings[slot];
//   if (!html || !html.trim()) return null;
//   return (
//     <aside className={`overflow-hidden rounded-2xl border border-white/8 bg-panel/60 ${className}`} aria-label={labels[slot]}>
//       <div className="border-b border-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
//         {labels[slot]}
//       </div>
//       <div className="p-3" dangerouslySetInnerHTML={{ __html: html }} />
//     </aside>
//   );
// }
"use client";

import { useEffect, useRef } from "react";
import type { SiteSettings } from "@/server/services/settings";

type AdSlotKey = "adHomeHtml" | "adListHtml" | "adWatchHtml";

const labels: Record<AdSlotKey, string> = {
  adHomeHtml: "Advertisement",
  adListHtml: "Sponsored",
  adWatchHtml: "Advertisement",
};

export function AdSlot({
  settings,
  slot,
  className = "",
}: {
  settings: SiteSettings;
  slot: AdSlotKey;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const enabled = settings.adsEnabled;
  const html = settings[slot] ?? "";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();

    if (!enabled || !html.trim()) return;

    container.innerHTML = html;

    container.querySelectorAll("script").forEach((oldScript) => {
      const newScript = document.createElement("script");

      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });

      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });

    return () => container.replaceChildren();
  }, [enabled, html]);

  if (!enabled || !html.trim()) return null;

  return (
    <aside
      className={`overflow-hidden rounded-2xl border border-white/8 bg-panel/60 ${className}`}
      aria-label={labels[slot]}
    >
      <div className="border-b border-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
        {labels[slot]}
      </div>
      {/* <div ref={containerRef} className="p-3" /> */}
      <div ref={containerRef} className="ad-slot-content" />
    </aside>
  );
}