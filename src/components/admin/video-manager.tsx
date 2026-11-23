"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAsyncLoader } from "@/hooks/use-async-loader";
import {
  AlertTriangle,
  Archive,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  LoaderCircle,
  Pencil,
  Play,
  RefreshCcw,
  Replace,
  Search,
  Star,
  StarOff,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { GridSkeleton } from "@/components/ui/skeleton";
import { VibePlayPlayer } from "@/components/player/vibeplay-player";
import { apiRequest } from "@/lib/admin-client";
import { formatBytes, formatDuration, formatViews, timeAgo } from "@/lib/format";
import type { AdminCategory, AdminVideo } from "@/components/admin/admin-types";
import { VideoEditModal } from "@/components/admin/video-edit-modal";

interface ListResponse {
  videos: AdminVideo[];
  total: number;
  page: number;
  totalPages: number;
}

export function VideoManager() {
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [storageFilter, setStorageFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [previewVideo, setPreviewVideo] = useState<AdminVideo | null>(null);
  const [editVideo, setEditVideo] = useState<AdminVideo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminVideo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { loading, error, setError, reload } = useAsyncLoader(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (appliedSearch) params.set("q", appliedSearch);
    if (categoryFilter) params.set("category", categoryFilter);
    if (storageFilter) params.set("storage", storageFilter);
    const res = await apiRequest<ListResponse>(`/api/admin/videos?${params.toString()}`);
    setVideos(res.videos);
    setTotal(res.total);
    setTotalPages(res.totalPages);
  }, `${page}|${appliedSearch}|${categoryFilter}|${storageFilter}`);

  useAsyncLoader(async () => {
    const catRes = await apiRequest<{ categories: AdminCategory[] }>("/api/admin/categories");
    setCategories(catRes.categories);
  });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  async function act(id: string, fn: () => Promise<string | void>) {
    setBusyId(id);
    setError(null);
    try {
      const message = await fn();
      if (typeof message === "string") setNotice({ type: "success", message });
      reload();
    } catch (err) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : "Action failed." });
    } finally {
      setBusyId(null);
    }
  }

  const togglePublish = (v: AdminVideo) =>
    act(v.id, async () => {
      await apiRequest(`/api/admin/videos/${v.id}`, {
        method: "PATCH",
        body: JSON.stringify({ published: !v.published }),
      });
      return v.published ? "Unpublished." : "Published.";
    });

  const toggleFeature = (v: AdminVideo) =>
    act(v.id, async () => {
      await apiRequest(`/api/admin/videos/${v.id}`, {
        method: "PATCH",
        body: JSON.stringify({ featured: !v.featured }),
      });
      return v.featured ? "Removed from featured." : "Marked as featured.";
    });

  const deleteVideo = (v: AdminVideo) =>
    act(v.id, async () => {
      const res = await apiRequest<{ deletedStoragePaths: string[] }>(`/api/admin/videos/${v.id}`, {
        method: "DELETE",
      });
      return res.deletedStoragePaths.length > 0
        ? `Deleted video and removed ${res.deletedStoragePaths.length} file(s) from Supabase Storage.`
        : "Video record deleted from MongoDB.";
    });

  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-40 cursor-pointer";

  return (
    <div className="space-y-5">
      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-sm ${
            notice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/import" className={buttonClasses("primary", "sm")}>
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Upload Video
        </Link>
        <p className="text-xs text-zinc-500" aria-live="polite">
          {loading ? "Loading…" : `${total} video${total === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search videos…"
            aria-label="Search videos"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
          className="sm:w-52"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={storageFilter}
          onChange={(e) => {
            setStorageFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by storage status"
          className="sm:w-48"
        >
          <option value="">All storage</option>
          <option value="supabase">Supabase Storage</option>
          <option value="legacy">Legacy (Unmigrated)</option>
        </Select>
      </div>

      {loading ? (
        <GridSkeleton count={6} />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/5 px-6 py-10 text-center">
          <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
          <p className="text-sm text-red-300">{error}</p>
          <Button variant="ghost" onClick={reload}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Retry
          </Button>
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
          <Film className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
          <p className="mt-3 text-sm text-zinc-500">No videos match your filters.</p>
          <Link href="/admin/import" className={`${buttonClasses("outline", "md")} mt-4`}>
            <Upload className="h-4 w-4" aria-hidden="true" /> Upload a video
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {videos.map((video) => {
            const isLegacy = video.storageProvider === "legacy";
            return (
              <li key={video.id} className="rounded-2xl border border-white/8 bg-panel/70 p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setPreviewVideo(video)}
                    title={`Preview ${video.title}`}
                    className="group relative h-[74px] w-full max-w-[132px] shrink-0 overflow-hidden rounded-lg bg-raised cursor-pointer"
                  >
                    {video.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="vibe-surface flex h-full w-full items-center justify-center text-[10px] text-zinc-500">
                        No thumbnail
                      </div>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100">
                      <Play className="h-5 w-5 fill-white text-white" aria-hidden="true" />
                    </span>
                    {video.durationSeconds !== null && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px] font-semibold text-white tabular-nums">
                        {formatDuration(video.durationSeconds)}
                      </span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isLegacy ? (
                        <Badge tone="amber">
                          <Archive className="h-3 w-3" aria-hidden="true" />
                          Legacy (Unmigrated)
                        </Badge>
                      ) : (
                        <Badge tone="cyan">Supabase</Badge>
                      )}
                      {video.published && !isLegacy ? (
                        <Badge tone="green">Published</Badge>
                      ) : (
                        <Badge tone="zinc">Draft</Badge>
                      )}
                      {video.featured && <Badge tone="purple">Featured</Badge>}
                      {video.ageRestricted && <Badge tone="red">18+</Badge>}
                      {video.categoryName && <Badge tone="violet">{video.categoryName}</Badge>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewVideo(video)}
                      className="mt-1 block max-w-full truncate text-left font-display font-semibold text-zinc-100 transition hover:text-violet-300 cursor-pointer"
                      title={`Preview ${video.title}`}
                    >
                      {video.title}
                    </button>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatViews(video.views)} views · added {timeAgo(video.createdAt)}
                      {video.fileSizeBytes ? ` · ${formatBytes(video.fileSizeBytes)}` : ""}
                      {video.width && video.height ? ` · ${video.width}×${video.height}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    {isLegacy && (
                      <Link
                        href={`/admin/import?replace=${encodeURIComponent(video.id)}`}
                        className={buttonClasses("outline", "sm")}
                        title="Upload a local MP4 to replace this legacy record in place"
                      >
                        <Replace className="h-3.5 w-3.5" aria-hidden="true" />
                        Replace File
                      </Link>
                    )}
                    {!isLegacy && (
                      <Link
                        href={`/admin/import?replace=${encodeURIComponent(video.id)}`}
                        className={iconBtn}
                        title="Replace video file"
                      >
                        <Replace className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    )}
                    <button
                      type="button"
                      className={iconBtn + " hover:border-cyan-500/50 hover:text-cyan-300"}
                      title="Preview inside VibePlay player"
                      onClick={() => setPreviewVideo(video)}
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {video.published && !isLegacy && (
                      <Link href={`/watch/${video.id}`} className={iconBtn} title="Open Watch Page">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    )}
                    <button
                      type="button"
                      className={iconBtn}
                      title="Edit title, description & category"
                      onClick={() => setEditVideo(video)}
                      disabled={busyId === video.id}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      title={video.published ? "Unpublish" : "Publish"}
                      onClick={() => togglePublish(video)}
                      disabled={busyId === video.id || (isLegacy && !video.published)}
                    >
                      {video.published ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      title={video.featured ? "Unfeature" : "Feature"}
                      onClick={() => toggleFeature(video)}
                      disabled={busyId === video.id}
                    >
                      {video.featured ? (
                        <StarOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Star className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      className={iconBtn + " hover:border-red-500/40 hover:text-red-400"}
                      title="Delete video & Supabase media"
                      onClick={() => {
                        setDeleteTarget(video);
                        setConfirmDelete(false);
                      }}
                      disabled={busyId === video.id}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Native HTML5 Admin Preview Modal */}
      {previewVideo && (
        <Modal
          open
          onClose={() => setPreviewVideo(null)}
          title={`Preview — ${previewVideo.title}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4">
            <VibePlayPlayer
              videoId={previewVideo.id}
              title={previewVideo.title}
              storageProvider={previewVideo.storageProvider}
              videoUrl={previewVideo.videoUrl}
              thumbnailUrl={previewVideo.thumbnailUrl}
              ageRestricted={previewVideo.ageRestricted}
              ageGateEnabled={false}
              autoPlay
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
              <span>
                Storage:{" "}
                <strong className="text-zinc-200">
                  {previewVideo.storageProvider === "supabase"
                    ? `Supabase (${previewVideo.supabaseBucket})`
                    : "Legacy (Unmigrated)"}
                </strong>
                {previewVideo.fileSizeBytes ? ` · ${formatBytes(previewVideo.fileSizeBytes)}` : ""}
              </span>
              <div className="flex items-center gap-2">
                {previewVideo.storageProvider === "legacy" && (
                  <Link
                    href={`/admin/import?replace=${encodeURIComponent(previewVideo.id)}`}
                    className={buttonClasses("primary", "sm")}
                  >
                    <Replace className="h-3.5 w-3.5" aria-hidden="true" />
                    Replace with MP4
                  </Link>
                )}
                {previewVideo.published && previewVideo.storageProvider === "supabase" && (
                  <Link
                    href={`/watch/${previewVideo.id}`}
                    className={buttonClasses("outline", "sm")}
                  >
                    Open Watch Page
                  </Link>
                )}
                <Button variant="ghost" size="sm" onClick={() => setPreviewVideo(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {editVideo && (
        <VideoEditModal
          key={editVideo.id}
          video={editVideo}
          categories={categories}
          onClose={() => setEditVideo(null)}
          onSaved={() => {
            setNotice({ type: "success", message: "Video saved." });
            reload();
          }}
        />
      )}

      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title="Delete video">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-zinc-400">
              <strong className="text-zinc-200">“{deleteTarget.title}”</strong> will be permanently
              deleted from MongoDB
              {deleteTarget.storageProvider === "supabase"
                ? " along with its MP4 video and thumbnail objects in Supabase Storage."
                : " (legacy record only — no external provider account is modified)."}
            </p>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs font-semibold text-zinc-500 underline underline-offset-2 transition hover:text-zinc-300 cursor-pointer"
            >
              {confirmDelete
                ? "Click Delete permanently below to confirm."
                : "I understand — enable permanent delete"}
            </button>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!confirmDelete || busyId === deleteTarget.id}
                onClick={() => {
                  const v = deleteTarget;
                  setDeleteTarget(null);
                  void deleteVideo(v);
                }}
              >
                {busyId === deleteTarget.id && (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Delete permanently
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
