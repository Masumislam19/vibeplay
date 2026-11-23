"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Film,
  HardDrive,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  Play,
  RefreshCcw,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Label, Select, Textarea, Toggle } from "@/components/ui/form";
import { apiRequest } from "@/lib/admin-client";
import { formatBytes, formatDuration } from "@/lib/format";
import { startSignedTusUpload, type TusUploadController } from "@/lib/supabase-tus-upload";
import { extractThumbnailFromVideoFile, type ExtractedThumbnail } from "@/lib/video-thumbnail";
import type { AdminCategory, AdminVideo } from "@/components/admin/admin-types";

type UploadStage =
  | "idle"
  | "authorizing"
  | "uploading-video"
  | "uploading-thumbnail"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

interface StorageConfig {
  configured: boolean;
  missingEnvVars: string[];
  bucket: string;
  projectUrl: string | null;
  maxFileBytes: number;
  chunkSizeBytes: number;
  storageQuotaBytes: number;
  storageWarnBytes: number;
  storageStopBytes: number;
  egressQuotaBytes: number;
  usedBytes: number;
  videoCount: number;
  quota: {
    allowed: boolean;
    warning: boolean;
    usedBytes: number;
    quotaBytes: number;
    percentOfFreeQuota: number;
    message: string | null;
  };
}

interface AuthorizeResponse {
  uploadSessionId: string;
  mode: "create" | "replace";
  videoId: string;
  bucket: string;
  resumableEndpoint: string;
  publishableKey: string;
  chunkSizeBytes: number;
  videoUpload: {
    objectPath: string;
    token: string;
    signedUrl: string;
    publicUrl: string;
    contentType: string;
  };
  thumbnailUpload: {
    objectPath: string;
    token: string;
    signedUrl: string;
    publicUrl: string;
    contentType: string;
  } | null;
}

interface CompleteResponse {
  video: AdminVideo;
  supportsByteRanges: boolean;
}

const MAX_FREE_FILE_BYTES = 50 * 1024 * 1024; // 50 MB Supabase Free global cap

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function ImportManager({ replaceVideoId }: { replaceVideoId?: string | null }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeTusRef = useRef<TusUploadController | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [config, setConfig] = useState<StorageConfig | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<AdminVideo | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Selected local MP4 state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const [detectedWidth, setDetectedWidth] = useState<number | null>(null);
  const [detectedHeight, setDetectedHeight] = useState<number | null>(null);

  // Automatic Canvas frame thumbnail state
  const [thumbnail, setThumbnail] = useState<ExtractedThumbnail | null>(null);
  const [thumbAttempt, setThumbAttempt] = useState(0);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [ageRestricted, setAgeRestricted] = useState(false);
  const [publishAfterUpload, setPublishAfterUpload] = useState(true);

  // Upload progress & result state
  const [stage, setStage] = useState<UploadStage>("idle");
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedVideo, setSavedVideo] = useState<AdminVideo | null>(null);
  const [byteRangeVerified, setByteRangeVerified] = useState<boolean | null>(null);

  const refreshConfig = useCallback(() => {
    apiRequest<StorageConfig>("/api/admin/uploads/authorize")
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    apiRequest<{ categories: AdminCategory[] }>("/api/admin/categories")
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
    refreshConfig();
  }, [refreshConfig]);

  // If replacing an existing (e.g. legacy) video record, load its preserved metadata.
  useEffect(() => {
    if (!replaceVideoId) return;
    apiRequest<{ video: AdminVideo }>(`/api/admin/videos/${encodeURIComponent(replaceVideoId)}`)
      .then(({ video }) => {
        setReplaceTarget(video);
        setTitle(video.title);
        setDescription(video.description ?? "");
        setCategoryId(video.categoryId ?? "");
        setAgeRestricted(video.ageRestricted);
        setPublishAfterUpload(video.published || true);
      })
      .catch((err) => {
        setErrorMessage(
          err instanceof Error ? err.message : "Could not load the target video to replace.",
        );
      });
  }, [replaceVideoId]);

  useEffect(() => {
    return () => {
      void activeTusRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (thumbnail?.previewUrl) URL.revokeObjectURL(thumbnail.previewUrl);
    };
  }, [thumbnail]);

  const generateThumbnail = useCallback(async (file: File, attempt: number) => {
    setThumbBusy(true);
    setThumbError(null);
    try {
      const extracted = await extractThumbnailFromVideoFile(file, attempt);
      setThumbnail(extracted);
      if (extracted.durationSeconds !== null) setDetectedDuration(extracted.durationSeconds);
      if (extracted.videoWidth > 0) setDetectedWidth(extracted.videoWidth);
      if (extracted.videoHeight > 0) setDetectedHeight(extracted.videoHeight);
    } catch (err) {
      setThumbnail(null);
      setThumbError(
        err instanceof Error
          ? err.message
          : "Could not extract a thumbnail frame from this video in your browser.",
      );
    } finally {
      setThumbBusy(false);
    }
  }, []);

  function handleSelectFile(file: File | null | undefined) {
    if (!file) return;
    setSavedVideo(null);
    setByteRangeVerified(null);
    setErrorMessage(null);
    setStage("idle");
    setUploadedBytes(0);
    setTotalBytes(file.size);
    setDetectedDuration(null);
    setDetectedWidth(null);
    setDetectedHeight(null);
    setThumbAttempt(0);

    const maxBytes = config?.maxFileBytes ?? MAX_FREE_FILE_BYTES;
    const isMp4Ext = file.name.toLowerCase().endsWith(".mp4");
    const isMp4Mime = file.type === "video/mp4";

    if (!isMp4Ext || !isMp4Mime) {
      setSelectedFile(null);
      setVideoPreviewUrl(null);
      setThumbnail(null);
      setErrorMessage(
        `Only browser-compatible MP4 videos (video/mp4, H.264 + AAC) are supported. Selected "${file.name}" (${file.type || "unknown MIME"}). Convert locally with a free tool like HandBrake before uploading.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size <= 0) {
      setErrorMessage("The selected video file is empty.");
      return;
    }

    if (file.size > maxBytes) {
      const actualMb = (file.size / (1024 * 1024)).toFixed(1);
      setSelectedFile(null);
      setVideoPreviewUrl(null);
      setThumbnail(null);
      setErrorMessage(
        `This file is ${actualMb} MB, which exceeds the Supabase Free 50 MB per-file upload limit (this global cap cannot be bypassed on the Free plan). Compress the MP4 locally (e.g. HandBrake Fast 720p30/1080p30 H.264 + AAC) to under 50 MB and try again.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setVideoPreviewUrl(previewUrl);
    if (!replaceTarget) {
      setTitle(titleFromFilename(file.name));
    }
    void generateThumbnail(file, 0);
  }

  function handleRegenerateThumbnail() {
    if (!selectedFile || thumbBusy) return;
    const nextAttempt = thumbAttempt + 1;
    setThumbAttempt(nextAttempt);
    void generateThumbnail(selectedFile, nextAttempt);
  }

  function clearSelectedFile() {
    if (
      stage === "authorizing" ||
      stage === "uploading-video" ||
      stage === "uploading-thumbnail" ||
      stage === "finalizing"
    ) {
      return;
    }
    setSelectedFile(null);
    setVideoPreviewUrl(null);
    setThumbnail(null);
    setThumbError(null);
    setDetectedDuration(null);
    setDetectedWidth(null);
    setDetectedHeight(null);
    setSavedVideo(null);
    setByteRangeVerified(null);
    setErrorMessage(null);
    setStage("idle");
    setUploadedBytes(0);
    setTotalBytes(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function cancelActiveUpload() {
    const controller = activeTusRef.current;
    const sessionId = activeSessionIdRef.current;
    activeTusRef.current = null;
    activeSessionIdRef.current = null;

    if (controller) {
      await controller.cancel();
    }
    setStage("cancelled");
    setErrorMessage("Upload cancelled.");

    if (sessionId) {
      void fetch("/api/admin/uploads/complete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadSessionId: sessionId }),
      }).catch(() => undefined);
    }
  }

  async function startUpload(e?: React.FormEvent) {
    e?.preventDefault();
    if (!selectedFile) return;

    setErrorMessage(null);
    setSavedVideo(null);
    setByteRangeVerified(null);
    setStage("authorizing");
    setUploadedBytes(0);
    setTotalBytes(selectedFile.size);

    let sessionId: string | null = null;
    try {
      // 1. Ask VibePlay backend to validate & mint short-lived signed upload tokens.
      const grant = await apiRequest<AuthorizeResponse>("/api/admin/uploads/authorize", {
        method: "POST",
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: selectedFile.type || "video/mp4",
          sizeBytes: selectedFile.size,
          thumbnailMimeType: thumbnail?.contentType ?? null,
          thumbnailSizeBytes: thumbnail?.byteLength ?? null,
          replaceVideoId: replaceTarget?.id ?? null,
        }),
      });

      sessionId = grant.uploadSessionId;
      activeSessionIdRef.current = sessionId;

      // 2. Direct browser-to-Supabase signed resumable TUS upload (6 MiB chunks).
      setStage("uploading-video");
      const videoController = startSignedTusUpload({
        file: selectedFile,
        endpoint: grant.resumableEndpoint,
        bucketName: grant.bucket,
        objectName: grant.videoUpload.objectPath,
        contentType: grant.videoUpload.contentType,
        token: grant.videoUpload.token,
        publishableKey: grant.publishableKey,
        chunkSizeBytes: grant.chunkSizeBytes,
        onProgress: (loaded, total) => {
          setUploadedBytes(loaded);
          setTotalBytes(total);
        },
      });
      activeTusRef.current = videoController;
      await videoController.promise;
      activeTusRef.current = null;
      setUploadedBytes(selectedFile.size);
      setTotalBytes(selectedFile.size);

      // 3. Upload auto-generated frame thumbnail to Supabase Storage via signed TUS.
      let thumbnailUploaded = false;
      if (thumbnail && grant.thumbnailUpload) {
        setStage("uploading-thumbnail");
        try {
          const thumbController = startSignedTusUpload({
            file: thumbnail.blob,
            endpoint: grant.resumableEndpoint,
            bucketName: grant.bucket,
            objectName: grant.thumbnailUpload.objectPath,
            contentType: grant.thumbnailUpload.contentType,
            token: grant.thumbnailUpload.token,
            publishableKey: grant.publishableKey,
            chunkSizeBytes: grant.chunkSizeBytes,
          });
          activeTusRef.current = thumbController;
          await thumbController.promise;
          activeTusRef.current = null;
          thumbnailUploaded = true;
        } catch (thumbErr) {
          activeTusRef.current = null;
          setThumbError(
            thumbErr instanceof Error
              ? `Video uploaded, but thumbnail upload failed: ${thumbErr.message}`
              : "Video uploaded, but thumbnail upload failed.",
          );
        }
      }

      // 4. Verify uploaded object exists on Supabase & save final metadata in MongoDB.
      setStage("finalizing");
      const completed = await apiRequest<CompleteResponse>("/api/admin/uploads/complete", {
        method: "POST",
        body: JSON.stringify({
          uploadSessionId: grant.uploadSessionId,
          title: title.trim() || titleFromFilename(selectedFile.name),
          description: description.trim() || null,
          categoryId: categoryId || null,
          durationSeconds: detectedDuration,
          width: detectedWidth,
          height: detectedHeight,
          ageRestricted,
          published: publishAfterUpload,
          thumbnailUploaded,
        }),
      });

      activeSessionIdRef.current = null;
      setSavedVideo(completed.video);
      setByteRangeVerified(completed.supportsByteRanges);
      setStage("completed");
      refreshConfig();
    } catch (err) {
      activeTusRef.current = null;
      const msg = err instanceof Error ? err.message : "Upload failed. Please retry.";
      if (/cancel/i.test(msg)) {
        setStage("cancelled");
        setErrorMessage("Upload cancelled.");
      } else {
        setStage("failed");
        setErrorMessage(msg);
      }
      if (sessionId && activeSessionIdRef.current === sessionId) {
        activeSessionIdRef.current = null;
        void fetch("/api/admin/uploads/complete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadSessionId: sessionId }),
        }).catch(() => undefined);
      }
    }
  }

  const progressPercent =
    totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;
  const isBusy =
    stage === "authorizing" ||
    stage === "uploading-video" ||
    stage === "uploading-thumbnail" ||
    stage === "finalizing";

  return (
    <div className="space-y-6">
      {/* Legacy replacement banner */}
      {replaceTarget && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">
          <div className="flex items-start gap-2.5">
            <Archive className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                Replacing video file for existing record: “{replaceTarget.title}”
              </p>
              <p className="mt-0.5 text-cyan-200/80">
                All existing metadata, views ({replaceTarget.views}), and database ID are preserved.
                No duplicate record will be created.
              </p>
            </div>
          </div>
          <Link href="/admin/videos" className={buttonClasses("ghost", "sm")}>
            Back to Videos
          </Link>
        </div>
      )}

      {/* Supabase configuration warning */}
      {config && !config.configured && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Supabase Storage is not fully configured on this server.</p>
            <p className="mt-0.5 text-amber-200/85">
              Missing environment variables:{" "}
              <code className="text-amber-100">{config.missingEnvVars.join(", ")}</code>. You can
              select an MP4 and preview automatic thumbnail extraction locally right now; set the
              Supabase env vars to enable direct uploads to bucket{" "}
              <code className="text-amber-100">{config.bucket}</code>.
            </p>
          </div>
        </div>
      )}

      {/* Free-plan storage quota monitor */}
      {config && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs ${
            !config.quota.allowed
              ? "border-red-500/35 bg-red-500/10 text-red-200"
              : config.quota.warning
                ? "border-amber-500/35 bg-amber-500/10 text-amber-200"
                : "border-white/8 bg-panel/70 text-zinc-400"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-semibold text-zinc-200">
              <HardDrive className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
              Supabase Storage ({config.bucket}):{" "}
              {formatBytes(config.usedBytes) ?? "0 B"} /{" "}
              {formatBytes(config.storageQuotaBytes) ?? "1 GB"} ({config.quota.percentOfFreeQuota}%)
            </span>
            <span>Max 50 MB per MP4 · 5 GB monthly Free egress · 6 MiB resumable chunks</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${
                !config.quota.allowed
                  ? "bg-red-500"
                  : config.quota.warning
                    ? "bg-amber-400"
                    : "bg-gradient-to-r from-violet-500 to-cyan-400"
              }`}
              style={{ width: `${Math.min(100, Math.max(2, config.quota.percentOfFreeQuota))}%` }}
            />
          </div>
          {config.quota.message && <p className="mt-2 font-medium">{config.quota.message}</p>}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-panel/80 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              {replaceTarget ? "Select Replacement MP4" : "Upload Video From Device"}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Select a browser-compatible MP4 (H.264 + AAC) from your computer or phone gallery.
              VibePlay extracts a thumbnail frame automatically and uploads directly to Supabase
              Storage via signed resumable TUS (6 MiB chunks).
            </p>
          </div>
          <Badge tone="cyan">MP4 · Max 50 MB</Badge>
        </div>

        {/* Native picker — accept="video/mp4" without capture opens existing gallery on mobile */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4"
          className="sr-only"
          aria-label="Select MP4 video from device"
          onChange={(e) => handleSelectFile(e.target.files?.[0])}
          disabled={isBusy}
        />

        {!selectedFile ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleSelectFile(e.dataTransfer.files?.[0]);
            }}
            className={`mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
              dragOver
                ? "border-violet-400 bg-violet-500/12"
                : "border-white/15 bg-void/50 hover:border-violet-500/40"
            }`}
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/25 to-cyan-500/20 text-violet-300">
              <Upload className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="font-display text-base font-semibold text-white">
              Drag &amp; drop an MP4 video here, or choose from your device
            </p>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-zinc-500">
              Browser-compatible MP4 (H.264 video + AAC audio), up to 50 MB on the Supabase Free
              plan. On Android &amp; iPhone, tapping Select Video opens your existing media gallery.
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Film className="h-4 w-4" aria-hidden="true" />
              Select Video
            </Button>
          </div>
        ) : (
          <form onSubmit={startUpload} className="mt-5 space-y-6">
            {/* Selected file summary */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-void/60 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-100" title={selectedFile.name}>
                  {selectedFile.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <Badge tone="violet">MP4</Badge>
                  <span>{formatBytes(selectedFile.size) ?? `${selectedFile.size} B`}</span>
                  {detectedDuration !== null && (
                    <span className="tabular-nums text-cyan-300">
                      Duration: {formatDuration(detectedDuration)}
                    </span>
                  )}
                  {detectedWidth && detectedHeight && (
                    <span className="tabular-nums text-zinc-500">
                      {detectedWidth}×{detectedHeight}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change video
                </Button>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  disabled={isBusy}
                  aria-label="Remove selected video"
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Dual preview: Video Preview + Auto-Extracted Frame Thumbnail */}
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Video Preview</Label>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                  {videoPreviewUrl ? (
                    <video
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(e) => {
                        const el = e.currentTarget;
                        if (Number.isFinite(el.duration) && el.duration > 0) {
                          setDetectedDuration(Math.round(el.duration));
                        }
                        if (el.videoWidth > 0) setDetectedWidth(el.videoWidth);
                        if (el.videoHeight > 0) setDetectedHeight(el.videoHeight);
                      }}
                      className="aspect-video w-full bg-black"
                    />
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Automatic Thumbnail (from video frame)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={thumbBusy || isBusy}
                    onClick={handleRegenerateThumbnail}
                  >
                    <RefreshCcw
                      className={`h-3.5 w-3.5 ${thumbBusy ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    Regenerate Thumbnail
                  </Button>
                </div>

                <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-void/80">
                  {thumbBusy ? (
                    <div className="flex flex-col items-center gap-2 text-xs text-zinc-400">
                      <LoaderCircle
                        className="h-5 w-5 animate-spin text-violet-400"
                        aria-hidden="true"
                      />
                      Extracting frame from video…
                    </div>
                  ) : thumbnail ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnail.previewUrl}
                        alt="Auto-generated video frame thumbnail"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-zinc-200">
                        {thumbnail.width}×{thumbnail.height} · {formatBytes(thumbnail.byteLength)} ·{" "}
                        {thumbnail.contentType.replace("image/", "").toUpperCase()} @{" "}
                        {thumbnail.timestampSeconds}s
                      </span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-4 text-center text-xs text-zinc-500">
                      <ImageIcon className="h-6 w-6 text-zinc-600" aria-hidden="true" />
                      <span>No decoded frame available.</span>
                    </div>
                  )}
                </div>

                {thumbError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                  >
                    {thumbError}
                  </p>
                )}
              </div>
            </div>

            {/* Metadata fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="upload-title">Title</Label>
                <Input
                  id="upload-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={isBusy}
                  maxLength={300}
                  placeholder="Enter a clear video title"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="upload-description">Description</Label>
                <Textarea
                  id="upload-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isBusy}
                  maxLength={5000}
                  placeholder="Describe this video (optional)…"
                />
              </div>

              <div>
                <Label htmlFor="upload-category">Category</Label>
                <Select
                  id="upload-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={isBusy}
                >
                  <option value="">— No category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col justify-end gap-3 pb-1">
                <Toggle
                  checked={ageRestricted}
                  onChange={setAgeRestricted}
                  disabled={isBusy}
                  label="18+ Age-restricted content"
                />
                <Toggle
                  checked={publishAfterUpload}
                  onChange={setPublishAfterUpload}
                  disabled={isBusy}
                  label="Publish after successful upload"
                />
              </div>
            </div>

            {/* Live TUS Progress Panel */}
            {isBusy && (
              <div className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/8 p-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="inline-flex items-center gap-2 font-semibold text-violet-200">
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {stage === "authorizing" && "Requesting signed upload token…"}
                    {stage === "uploading-video" &&
                      "Uploading MP4 directly to Supabase Storage (resumable 6 MiB chunks)…"}
                    {stage === "uploading-thumbnail" &&
                      "Uploading generated thumbnail to Supabase Storage…"}
                    {stage === "finalizing" &&
                      "Verifying stored object & saving metadata to MongoDB…"}
                  </span>
                  <span className="font-mono text-xs font-semibold tabular-nums text-cyan-300">
                    {progressPercent}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-150"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                  <span className="tabular-nums">
                    {formatBytes(uploadedBytes) ?? "0 B"} / {formatBytes(totalBytes) ?? "0 B"}
                  </span>
                  {(stage === "uploading-video" || stage === "uploading-thumbnail") && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => void cancelActiveUpload()}
                    >
                      Cancel Upload
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Completion Panel */}
            {savedVideo && stage === "completed" && (
              <div className="space-y-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                    <p className="font-display font-semibold text-white">
                      {replaceTarget
                        ? "Video replaced and migrated to Supabase Storage"
                        : "Video uploaded to Supabase Storage & saved to MongoDB"}
                    </p>
                  </div>
                  <Badge tone="green">
                    {savedVideo.published ? "Published & Ready" : "Saved as Draft"}
                  </Badge>
                </div>

                <p className="text-xs leading-relaxed text-zinc-300">
                  Storage path: <code className="text-white">{savedVideo.videoObjectPath}</code>
                  {byteRangeVerified !== null &&
                    (byteRangeVerified
                      ? " · Byte-range seeking verified (HTTP 206)."
                      : " · Public object verified.")}
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {savedVideo.published && (
                    <Link
                      href={`/watch/${savedVideo.id}`}
                      className={buttonClasses("primary", "sm")}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      Watch Now in VibePlay
                    </Link>
                  )}
                  <Link href="/admin/videos" className={buttonClasses("ghost", "sm")}>
                    Manage in Videos
                  </Link>
                  {!replaceTarget && (
                    <Button type="button" variant="outline" size="sm" onClick={clearSelectedFile}>
                      Upload Another Video
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Error / Cancelled alert with Retry */}
            {errorMessage && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs text-red-200"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                  {errorMessage}
                </span>
                {(stage === "failed" || stage === "cancelled") && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void startUpload()}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry Upload
                  </Button>
                )}
              </div>
            )}

            {/* Submit Actions */}
            {stage !== "completed" && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  size="lg"
                  disabled={isBusy || thumbBusy || (config ? !config.quota.allowed : false)}
                >
                  {isBusy ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isBusy
                    ? "Uploading…"
                    : replaceTarget
                      ? "Upload Replacement MP4"
                      : "Upload Video"}
                </Button>
                <span className="text-xs text-zinc-500">
                  Direct browser-to-Supabase resumable upload. Your Supabase Secret Key never leaves
                  the server.
                </span>
              </div>
            )}
          </form>
        )}

        {/* Helpful Free-plan & MP4 compression note */}
        <div className="mt-5 flex gap-3 rounded-xl border border-white/8 bg-void/50 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
          <div>
            <p className="font-semibold text-zinc-300">Video format &amp; Free-plan guidance</p>
            <p className="mt-1">
              Supabase Storage hosts your original MP4 directly (it does not transcode to HLS or
              multiple resolutions). For smooth playback on all browsers, use MP4 (H.264 video +
              AAC audio) under 50 MB. Need to shrink a larger file? Use free{" "}
              <strong className="text-zinc-300">HandBrake</strong> (“Fast 720p30” or “Fast 1080p30”
              preset) or{" "}
              <code className="text-zinc-300">
                ffmpeg -i input.mp4 -c:v libx264 -crf 24 -c:a aac -movflags +faststart output.mp4
              </code>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
