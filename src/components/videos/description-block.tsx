"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

/** Collapsible description with a smart "show more" that only appears when needed. */
export function DescriptionBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 4);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={`whitespace-pre-line text-sm leading-relaxed text-zinc-400 ${expanded ? "" : "line-clamp-3"}`}
      >
        {text}
      </p>
      {clamped && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-violet-300 transition hover:text-violet-200 cursor-pointer"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
