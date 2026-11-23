"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { readSessionFlag, subscribeSessionFlag, writeSessionFlag } from "@/lib/session-flag";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import type { StorageProvider } from "@/db";

const AGE_OK_KEY = "vp_age_ok";
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function useAgeVerified(): boolean {
  return useSyncExternalStore(
    subscribeSessionFlag,
    () => readSessionFlag(AGE_OK_KEY),
    () => false,
  );
}

export interface VibePlayPlayerProps {
  videoId: string;
  title: string;
  storageProvider: StorageProvider;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  ageRestricted: boolean;
  ageGateEnabled: boolean;
  autoPlay?: boolean;
}

/**
 * VibePlay native HTML5 video player powered directly by Supabase Storage public
 * MP4 URLs. Zero iframes, zero third-party embeds, zero external redirects.
 *
 * Features:
 * - Native HTML5 `<video>` with byte-range seeking
 * - Custom VibePlay control bar: Play/Pause, Seek + buffered progress, Volume,
 *   Mute/Unmute, Playback Speed, Fullscreen, Poster, Loading & Error states
 * - Autoplay attempt when allowed by browser, muted-autoplay fallback with
 *   explicit Unmute button, and prominent Play overlay if browser blocks autoplay
 */
export function VibePlayPlayer(props: VibePlayPlayerProps) {
  const {
    videoId,
    title,
    storageProvider,
    videoUrl,
    thumbnailUrl,
    ageRestricted,
    ageGateEnabled,
    autoPlay = true,
  } = props;

  const ageVerified = useAgeVerified();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mutedAutoplayBanner, setMutedAutoplayBanner] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const canPlay = storageProvider === "supabase" && Boolean(videoUrl);

  // Track fullscreen changes cleanly.
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Attempt audible autoplay when allowed; fall back to muted autoplay; if both
  // are blocked by browser policy, reveal the prominent Play overlay.
  useEffect(() => {
    if (!canPlay || !autoPlay || !videoRef.current) return;
    if (ageGateEnabled && ageRestricted && !ageVerified) return;

    const el = videoRef.current;
    let cancelled = false;
    el.muted = false;

    const attempt = el.play();
    if (attempt && typeof attempt.then === "function") {
      attempt
        .then(() => {
          if (cancelled) return;
          setPlaying(true);
          setMuted(false);
          setMutedAutoplayBanner(false);
          setAutoplayBlocked(false);
        })
        .catch(() => {
          if (cancelled) return;
          el.muted = true;
          setMuted(true);
          const mutedAttempt = el.play();
          if (mutedAttempt && typeof mutedAttempt.then === "function") {
            mutedAttempt
              .then(() => {
                if (cancelled) return;
                setPlaying(true);
                setMutedAutoplayBanner(true);
                setAutoplayBlocked(false);
              })
              .catch(() => {
                if (cancelled) return;
                el.muted = false;
                setMuted(false);
                setPlaying(false);
                setAutoplayBlocked(true);
              });
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [canPlay, autoPlay, videoId, videoUrl, reloadNonce, ageGateEnabled, ageRestricted, ageVerified]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      setMediaError(null);
      setAutoplayBlocked(false);
      el.play()
        .then(() => setPlaying(true))
        .catch(() => {
          setAutoplayBlocked(true);
        });
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const unmuteFromBanner = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    if (el.volume === 0) el.volume = 0.8;
    setMuted(false);
    setVolume(el.volume);
    setMutedAutoplayBanner(false);
    if (el.paused) {
      el.play().catch(() => undefined);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const nextMuted = !el.muted;
    el.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) setMutedAutoplayBanner(false);
  }, []);

  const handleVolumeChange = useCallback((next: number) => {
    const el = videoRef.current;
    if (!el) return;
    const clamped = Math.min(1, Math.max(0, next));
    el.volume = clamped;
    el.muted = clamped === 0;
    setVolume(clamped);
    setMuted(clamped === 0);
    if (clamped > 0) setMutedAutoplayBanner(false);
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(seconds)) return;
    el.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const cyclePlaybackRate = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const idx = PLAYBACK_RATES.indexOf(playbackRate as (typeof PLAYBACK_RATES)[number]);
    const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    el.playbackRate = next;
    setPlaybackRate(next);
  }, [playbackRate]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const el = videoRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) {
      document.exitFullscreen().catch(() => undefined);
    } else if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => undefined);
    } else if (el && "webkitEnterFullscreen" in el) {
      // iOS Safari native fullscreen fallback
      (el as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
    }
  }, []);

  function retryLoad() {
    setMediaError(null);
    setBuffering(true);
    setReloadNonce((n) => n + 1);
    videoRef.current?.load();
  }

  function acceptAge() {
    writeSessionFlag(AGE_OK_KEY, true);
  }

  if (ageGateEnabled && ageRestricted && !ageVerified) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/25 bg-gradient-to-b from-red-950/40 to-panel px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
          <ShieldAlert className="h-6 w-6 text-red-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-white">Age-restricted content</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
            This video is marked 18+. Please confirm that you are of legal age in your jurisdiction
            to continue.
          </p>
          <p className="mt-2 text-[11px] text-zinc-600">
            This is a self-declaration, not a legally verified age-verification check.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={acceptAge}
            className={buttonClasses("primary", "md") + " cursor-pointer"}
          >
            I am 18 or older — continue
          </button>
          <Link href="/" className={buttonClasses("ghost", "md")}>
            Leave
          </Link>
        </div>
      </div>
    );
  }

  if (!canPlay) {
    return (
      <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-amber-500/25 bg-panel px-6 text-center">
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20 blur-[2px]"
          />
        )}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
          <Archive className="h-6 w-6 text-amber-300" aria-hidden="true" />
        </div>
        <div className="relative space-y-2">
          <Badge tone="amber">Legacy video — unmigrated</Badge>
          <h2 className="font-display text-lg font-bold text-white">
            Video awaiting Supabase Storage upload
          </h2>
          <p className="mx-auto max-w-md text-xs leading-relaxed text-zinc-400">
            This record predates the Supabase Storage migration. Replace its video file with a local
            MP4 in Admin → Videos to enable native HTML5 playback while keeping its views and
            metadata intact.
          </p>
        </div>
      </div>
    );
  }

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-violet-950/35 select-none"
      onKeyDown={(e) => {
        if (e.code === "Space") {
          e.preventDefault();
          togglePlay();
        } else if (e.code === "KeyM") {
          toggleMute();
        } else if (e.code === "KeyF") {
          toggleFullscreen();
        } else if (e.code === "ArrowRight") {
          handleSeek(Math.min(duration, currentTime + 5));
        } else if (e.code === "ArrowLeft") {
          handleSeek(Math.max(0, currentTime - 5));
        }
      }}
      tabIndex={0}
      aria-label={`Video player: ${title}`}
    >
      <video
        key={`${videoId}-${reloadNonce}`}
        ref={videoRef}
        src={videoUrl ?? undefined}
        poster={thumbnailUrl ?? undefined}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          setAutoplayBlocked(false);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => {
          setBuffering(false);
          setPlaying(true);
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setDuration(el.duration);
          }
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setCurrentTime(el.currentTime);
          if (el.buffered.length > 0) {
            setBufferedEnd(el.buffered.end(el.buffered.length - 1));
          }
        }}
        onProgress={(e) => {
          const el = e.currentTarget;
          if (el.buffered.length > 0) {
            setBufferedEnd(el.buffered.end(el.buffered.length - 1));
          }
        }}
        onError={() => {
          setBuffering(false);
          setPlaying(false);
          setMediaError(
            "Unable to load this MP4 video stream. Verify the Supabase project is active (not paused) and the file is encoded as browser-compatible MP4 (H.264/AAC).",
          );
        }}
        className="h-full w-full cursor-pointer bg-black object-contain"
      />

      {/* Buffering spinner */}
      {buffering && !mediaError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <LoaderCircle className="h-10 w-10 animate-spin text-violet-400" aria-hidden="true" />
        </div>
      )}

      {/* Prominent Play button when paused or autoplay blocked */}
      {!playing && !mediaError && !buffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={`Play ${title}`}
            className="pulse-ring flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-500 text-white shadow-xl shadow-violet-950/60 transition hover:scale-105 cursor-pointer"
          >
            <Play className="ml-1 h-7 w-7 fill-current" aria-hidden="true" />
          </button>
          {autoplayBlocked && (
            <span className="rounded-full bg-black/75 px-3 py-1 text-xs font-medium text-zinc-200 backdrop-blur">
              Click to start playback
            </span>
          )}
        </div>
      )}

      {/* Muted autoplay banner */}
      {playing && mutedAutoplayBanner && muted && !mediaError && (
        <button
          type="button"
          onClick={unmuteFromBanner}
          className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/80 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-violet-600 cursor-pointer"
        >
          <VolumeX className="h-4 w-4 text-amber-300" aria-hidden="true" />
          Muted — Click to Unmute
          <Volume2 className="h-3.5 w-3.5 text-zinc-300" aria-hidden="true" />
        </button>
      )}

      {/* Error overlay */}
      {mediaError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
            <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
          </div>
          <p className="max-w-md text-xs leading-relaxed text-zinc-300">{mediaError}</p>
          <button
            type="button"
            onClick={retryLoad}
            className={buttonClasses("primary", "sm") + " cursor-pointer"}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry playback
          </button>
        </div>
      )}

      {/* Custom VibePlay control bar */}
      {!mediaError && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-10 transition-opacity duration-200 sm:px-4">
          {/* Seek bar */}
          <div className="relative mb-2.5 flex h-4 items-center">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="absolute inset-y-0 left-0 bg-white/30"
                style={{ width: `${bufferedPct}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-cyan-400"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              aria-label="Seek video timeline"
              onChange={(e) => handleSeek(Number.parseFloat(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-zinc-200">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
                className="rounded-lg p-1.5 text-white transition hover:bg-white/15 cursor-pointer"
              >
                {playing ? (
                  <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                )}
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="rounded-lg p-1.5 text-white transition hover:bg-white/15 cursor-pointer"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  aria-label="Volume"
                  onChange={(e) => handleVolumeChange(Number.parseFloat(e.target.value))}
                  className="hidden w-16 accent-violet-500 sm:block cursor-pointer"
                />
              </div>

              <span className="font-mono text-[11px] tabular-nums text-zinc-300">
                {formatDuration(Math.floor(currentTime)) ?? "0:00"} /{" "}
                {formatDuration(Math.floor(duration)) ?? "0:00"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={cyclePlaybackRate}
                aria-label={`Playback speed ${playbackRate}x`}
                title="Change playback speed"
                className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 font-mono text-[11px] font-semibold text-white transition hover:bg-white/20 cursor-pointer"
              >
                {playbackRate}x
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="rounded-lg p-1.5 text-white transition hover:bg-white/15 cursor-pointer"
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
