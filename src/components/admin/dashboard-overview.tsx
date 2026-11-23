"use client";

import Link from "next/link";
import { useState } from "react";
import { useAsyncLoader } from "@/hooks/use-async-loader";
import {
  AlertTriangle,
  Archive,
  Eye,
  Film,
  Flag,
  HardDrive,
  RefreshCcw,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/admin-client";
import { formatBytes, timeAgo } from "@/lib/format";

interface Stats {
  videos: {
    total: number;
    published: number;
    drafts: number;
    supabaseHosted: number;
    legacyUnmigrated: number;
    totalViews: number;
  };
  openReports: number;
  storage: {
    configured: boolean;
    missingEnvVars: string[];
    bucket: string;
    projectUrl: string | null;
    usedBytes: number;
    videoBytes: number;
    thumbnailBytes: number;
    maxFileBytes: number;
    storageQuotaBytes: number;
    storageWarnBytes: number;
    storageStopBytes: number;
    egressQuotaBytes: number;
    quota: {
      allowed: boolean;
      warning: boolean;
      percentOfFreeQuota: number;
      message: string | null;
    };
  };
  recentAudit: Array<{
    id: string;
    action: string;
    details: string | null;
    adminEmail: string | null;
    createdAt: string;
  }>;
}

const ACTION_LABELS: Record<string, string> = {
  "login.success": "Signed in",
  "login.failed": "Failed sign-in attempt",
  "login.rejected_email": "Rejected unauthorized login email",
  logout: "Signed out",
  "owner.setup": "Owner account created",
  "owner.setup_rejected_key": "Rejected invalid setup key",
  "recovery.requested": "Owner password recovery requested",
  "upload.authorized": "Signed Supabase upload authorized",
  "video.uploaded_supabase": "MP4 uploaded to Supabase Storage",
  "video.replaced_supabase": "Replaced video media with Supabase MP4",
  "video.update": "Video metadata updated",
  "video.delete": "Video & media deleted",
  "category.create": "Category created",
  "category.update": "Category updated",
  "category.delete": "Category deleted",
  "report.resolve": "Report resolved",
  "settings.update": "Site settings updated",
  "sessions.revoke": "All sessions revoked",
};

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Film;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-panel/70 p-4">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="font-display text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export function DashboardOverview() {
  const [stats, setStats] = useState<Stats | null>(null);

  const { loading, error, reload } = useAsyncLoader(async () => {
    setStats(await apiRequest<Stats>("/api/admin/stats"));
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-56" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/25 bg-red-500/5 px-6 py-12 text-center">
        <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
        <p className="text-sm text-red-300">{error ?? "Stats unavailable."}</p>
        <Button variant="ghost" onClick={reload}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Retry
        </Button>
      </div>
    );
  }

  const st = stats.storage;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Film}
          label="Total videos"
          value={String(stats.videos.total)}
          tone="bg-violet-500/15 text-violet-300"
        />
        <StatCard
          icon={UploadCloud}
          label="Published"
          value={String(stats.videos.published)}
          tone="bg-emerald-500/15 text-emerald-300"
        />
        <StatCard
          icon={Eye}
          label="Drafts"
          value={String(stats.videos.drafts)}
          tone="bg-amber-500/15 text-amber-300"
        />
        <StatCard
          icon={Archive}
          label="Legacy unmigrated"
          value={String(stats.videos.legacyUnmigrated)}
          tone="bg-zinc-500/15 text-zinc-300"
        />
        <StatCard
          icon={Eye}
          label="Total views"
          value={stats.videos.totalViews.toLocaleString()}
          tone="bg-cyan-500/15 text-cyan-300"
        />
        <StatCard
          icon={Flag}
          label="Open reports"
          value={String(stats.openReports)}
          tone="bg-fuchsia-500/15 text-fuchsia-300"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Supabase Storage Free Plan Monitor */}
        <section
          className="rounded-2xl border border-white/8 bg-panel/70 p-5"
          aria-label="Supabase Storage status"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 font-display font-bold text-white">
              <HardDrive className="h-4 w-4 text-cyan-400" aria-hidden="true" /> Supabase Storage
            </h2>
            <Badge tone={st.configured ? "green" : "amber"}>
              {st.configured ? "Configured" : "Setup needed"}
            </Badge>
          </div>

          {!st.configured ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-xs leading-relaxed text-amber-200">
              Missing environment variables:{" "}
              <code className="text-amber-100">{st.missingEnvVars.join(", ")}</code>. Set them in
              your host&apos;s Environment Variables to enable signed direct uploads to bucket{" "}
              <code className="text-amber-100">{st.bucket}</code>.
            </div>
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500">Public bucket</dt>
                  <dd className="mt-0.5 font-mono text-xs font-semibold text-zinc-100">
                    {st.bucket}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Tracked usage (Free 1 GB)</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                    {formatBytes(st.usedBytes) ?? "0 B"} ({st.quota.percentOfFreeQuota}%)
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Videos / Thumbnails</dt>
                  <dd className="mt-0.5 text-xs tabular-nums text-zinc-300">
                    {formatBytes(st.videoBytes) ?? "0 B"} / {formatBytes(st.thumbnailBytes) ?? "0 B"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Free plan limits</dt>
                  <dd className="mt-0.5 text-xs text-zinc-300">
                    Max {Math.round(st.maxFileBytes / (1024 * 1024))} MB/file ·{" "}
                    {Math.round(st.egressQuotaBytes / (1024 * 1024 * 1024))} GB egress
                  </dd>
                </div>
              </dl>

              <div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${
                      !st.quota.allowed
                        ? "bg-red-500"
                        : st.quota.warning
                          ? "bg-amber-400"
                          : "bg-gradient-to-r from-violet-500 to-cyan-400"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, st.quota.percentOfFreeQuota))}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  Warning at {Math.round(st.storageWarnBytes / (1024 * 1024))} MB · Uploads pause at{" "}
                  {Math.round(st.storageStopBytes / (1024 * 1024))} MB to protect Free quota. Note:
                  Supabase Free projects may pause after inactivity — check the Supabase dashboard
                  to wake if needed.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section className="rounded-2xl border border-white/8 bg-panel/70 p-5" aria-label="Quick actions">
          <h2 className="mb-4 font-display font-bold text-white">Quick actions</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/admin/import" className={buttonClasses("primary", "md")}>
              <UploadCloud className="h-4 w-4" aria-hidden="true" /> Upload MP4
            </Link>
            <Link href="/admin/videos" className={buttonClasses("ghost", "md")}>
              <Film className="h-4 w-4" aria-hidden="true" /> Manage videos
            </Link>
            <Link href="/admin/categories" className={buttonClasses("ghost", "md")}>
              Manage categories
            </Link>
            <Link href="/admin/reports" className={buttonClasses("ghost", "md")}>
              Review reports {stats.openReports > 0 && <Badge tone="red">{stats.openReports}</Badge>}
            </Link>
          </div>
          <div className="mt-4 rounded-xl border border-white/8 bg-void/60 px-4 py-3 text-xs leading-relaxed text-zinc-500">
            <ShieldCheck className="mb-1 h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            Uploads use short-lived server-signed TUS tokens. Your{" "}
            <code className="text-zinc-300">SUPABASE_SECRET_KEY</code> stays strictly server-side
            and never enters the browser bundle.
          </div>
        </section>
      </div>

      {/* Audit log */}
      <section className="rounded-2xl border border-white/8 bg-panel/70 p-5" aria-label="Recent audit log">
        <h2 className="mb-4 font-display font-bold text-white">Recent activity</h2>
        {stats.recentAudit.length === 0 ? (
          <p className="text-sm text-zinc-500">No audit events yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {stats.recentAudit.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-zinc-200">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                  {entry.details && (
                    <span className="block truncate text-xs text-zinc-500">{entry.details}</span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-zinc-600">{timeAgo(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
