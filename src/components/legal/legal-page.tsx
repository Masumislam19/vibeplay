import type { ReactNode } from "react";

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <article className="mx-auto max-w-3xl py-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-white">{title}</h1>
      <p className="mt-1 text-xs text-zinc-600">Last updated: {updated}</p>
      <p className="mt-5 rounded-2xl border border-white/8 bg-panel/70 px-5 py-4 text-sm leading-relaxed text-zinc-400">
        {intro}
      </p>
      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-lg font-bold text-violet-200">{section.heading}</h2>
            <div className="mt-2.5 space-y-3 text-sm leading-relaxed text-zinc-400">{section.body}</div>
          </section>
        ))}
      </div>
    </article>
  );
}
