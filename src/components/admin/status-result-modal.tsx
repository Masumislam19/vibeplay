"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDuration } from "@/lib/format";

export interface StatusResult {
  providerStatus: "processing" | "ready" | "error" | "blocked";
  inProgress: boolean;
  encodings: Array<{ type: string; progress: string; lastUpdate: string | null }>;
  meta: {
    filecode: string;
    title: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    providerCreatedAt: string | null;
    providerViews: number | null;
  } | null;
}

/** Live Vidara encoding/metadata readout for one video. */
export function StatusResultModal({ result, onClose }: { result: StatusResult; onClose: () => void }) {
  const statusTone =
    result.providerStatus === "ready" ? "green" : result.providerStatus === "processing" ? "amber" : result.providerStatus === "blocked" ? "red" : "red";

  return (
    <Modal open onClose={onClose} title="Vidara status" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge tone={statusTone}>{result.providerStatus.toUpperCase()}</Badge>
          {result.inProgress && <Badge tone="amber">Encoding in progress</Badge>}
        </div>

        {result.encodings.length > 0 && (
          <ul className="space-y-2">
            {result.encodings.map((enc, i) => (
              <li key={i} className="rounded-xl border border-white/8 bg-void/60 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold capitalize text-zinc-200">{enc.type}</span>
                  <span className="tabular-nums text-amber-300">{enc.progress}</span>
                </div>
                {enc.lastUpdate && <p className="mt-0.5 text-xs text-zinc-500">Last update: {enc.lastUpdate}</p>}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
                    style={{ width: Math.min(100, Math.max(2, Number.parseInt(enc.progress, 10) || 2)) + "%" }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {!result.inProgress && result.meta && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Provider title</dt>
              <dd className="text-zinc-200">{result.meta.title ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Length</dt>
              <dd className="tabular-nums text-zinc-200">{formatDuration(result.meta.durationSeconds) ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Provider views</dt>
              <dd className="tabular-nums text-zinc-200">{result.meta.providerViews ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Created</dt>
              <dd className="text-zinc-200">{result.meta.providerCreatedAt ?? "—"}</dd>
            </div>
          </dl>
        )}

        {!result.inProgress && !result.meta && (
          <p className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-xs leading-relaxed text-amber-200">
            Vidara reports no active encoding and no retrievable metadata yet. If this video was
            just imported, give it a moment and check again.
          </p>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
