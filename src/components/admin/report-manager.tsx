"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAsyncLoader } from "@/hooks/use-async-loader";
import { CheckCheck, ExternalLink, Flag, LoaderCircle, PauseCircle, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/admin-client";
import { timeAgo } from "@/lib/format";
import type { AdminReportItem } from "@/components/admin/admin-types";

const STATUS_FILTERS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "", label: "All" },
];

const REASON_LABELS: Record<string, string> = {
  copyright: "Copyright infringement",
  "illegal-content": "Illegal content",
  "minor-safety": "Child safety",
  "adult-misclassification": "Adult misclassified",
  "broken-playback": "Broken playback",
  other: "Other",
};

export function ReportManager() {
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [filter, setFilter] = useState("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-fetches automatically when the status filter changes.
  const { loading, error, setError, reload } = useAsyncLoader(async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (filter) params.set("status", filter);
    const res = await apiRequest<{ reports: AdminReportItem[] }>(`/api/admin/reports?${params.toString()}`);
    setReports(res.reports);
  }, filter);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function resolve(report: AdminReportItem, status: "resolved" | "dismissed", unpublishVideo: boolean) {
    setBusyId(report.id);
    setError(null);
    try {
      await apiRequest(`/api/admin/reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, unpublishVideo }),
      });
      setNotice(unpublishVideo ? "Report closed and video unpublished." : status === "resolved" ? "Report resolved." : "Report dismissed.");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter reports">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                filter === f.value
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:border-violet-500/40 hover:text-violet-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </Button>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500">Loading reports…</p>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
          <Flag className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
          <p className="mt-3 text-sm text-zinc-500">
            {filter === "open" ? "No open reports — all clear." : "No reports here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="rounded-2xl border border-white/8 bg-panel/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                {report.videoThumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={report.videoThumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" loading="lazy" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={report.status === "open" ? "amber" : report.status === "resolved" ? "green" : "zinc"}>
                      {report.status}
                    </Badge>
                    <Badge tone="red">{REASON_LABELS[report.reason] ?? report.reason}</Badge>
                    {!report.videoPublished && report.status === "open" && <Badge tone="zinc">Video unpublished</Badge>}
                  </div>
                  <p className="mt-1.5 font-semibold text-zinc-100">
                    {report.videoTitle ?? "Deleted video"}
                  </p>
                  {report.details && <p className="mt-1 text-sm leading-relaxed text-zinc-400">{report.details}</p>}
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {timeAgo(report.createdAt)}
                    {report.contactEmail ? ` · contact: ${report.contactEmail}` : " · no contact email"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {report.videoId && (
                    <Link
                      href={`/watch/${report.videoId}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-violet-500/40 hover:text-violet-300"
                    >
                      Inspect <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                  {report.status === "open" && (
                    <>
                      <Button size="sm" onClick={() => resolve(report, "resolved", false)} disabled={busyId === report.id}>
                        {busyId === report.id && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Resolve
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => resolve(report, "resolved", true)} disabled={busyId === report.id}>
                        <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" /> Unpublish
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => resolve(report, "dismissed", false)} disabled={busyId === report.id}>
                        Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
