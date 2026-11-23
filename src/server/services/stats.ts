import "server-only";
import { getCollections } from "@/db";
import { getFreePlanLimitsSummary } from "@/server/services/supabase-storage";
import { getTrackedSupabaseStorageUsage } from "@/server/services/videos";
import type { StorageQuotaEvaluation } from "@/server/services/supabase-storage-utils";

/** Real metrics for the admin overview from MongoDB Atlas + Supabase Storage usage. */

export interface AdminStats {
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
    quota: StorageQuotaEvaluation;
  };
  recentAudit: Array<{
    id: string;
    action: string;
    details: string | null;
    adminEmail: string | null;
    createdAt: Date;
  }>;
}

interface VideoStatsAgg {
  total: number;
  published: number;
  drafts: number;
  supabaseHosted: number;
  legacyUnmigrated: number;
  totalViews: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { videos, reports, auditLogs } = await getCollections();

  const [videoAggRows, openReports, auditDocs, usage] = await Promise.all([
    videos
      .aggregate<VideoStatsAgg>([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            published: { $sum: { $cond: ["$published", 1, 0] } },
            drafts: { $sum: { $cond: ["$published", 0, 1] } },
            supabaseHosted: {
              $sum: { $cond: [{ $eq: ["$storageProvider", "supabase"] }, 1, 0] },
            },
            legacyUnmigrated: {
              $sum: { $cond: [{ $ne: ["$storageProvider", "supabase"] }, 1, 0] },
            },
            totalViews: { $sum: { $ifNull: ["$views", 0] } },
          },
        },
      ])
      .toArray(),
    reports.countDocuments({ status: "open" }),
    auditLogs.find({}).sort({ createdAt: -1 }).limit(10).toArray(),
    getTrackedSupabaseStorageUsage(),
  ]);

  const counts = videoAggRows[0];
  const limits = getFreePlanLimitsSummary();

  return {
    videos: {
      total: counts?.total ?? 0,
      published: counts?.published ?? 0,
      drafts: counts?.drafts ?? 0,
      supabaseHosted: counts?.supabaseHosted ?? 0,
      legacyUnmigrated: counts?.legacyUnmigrated ?? 0,
      totalViews: counts?.totalViews ?? 0,
    },
    openReports,
    storage: {
      configured: limits.configured,
      missingEnvVars: limits.missingEnvVars,
      bucket: limits.bucket,
      projectUrl: limits.projectUrl,
      usedBytes: usage.usedBytes,
      videoBytes: usage.videoBytes,
      thumbnailBytes: usage.thumbnailBytes,
      maxFileBytes: limits.maxFileBytes,
      storageQuotaBytes: limits.storageQuotaBytes,
      storageWarnBytes: limits.storageWarnBytes,
      storageStopBytes: limits.storageStopBytes,
      egressQuotaBytes: limits.egressQuotaBytes,
      quota: usage.quota,
    },
    recentAudit: auditDocs.map((entry) => ({
      id: entry._id,
      action: entry.action,
      details: entry.details,
      adminEmail: entry.adminEmail,
      createdAt: entry.createdAt,
    })),
  };
}
