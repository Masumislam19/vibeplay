"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { readSessionFlag, subscribeSessionFlag, writeSessionFlag } from "@/lib/session-flag";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  resolveVerifiedInlinePlaybackUrl,
  tryExtractVidaraFilecode,
  type ProviderStatus,
} from "@/server/services/vidara-parse";

const AGE_OK_KEY = "vp_age_ok";

function useAgeVerified(): boolean {
  return useSyncExternalStore(
    subscribeSessionFlag,
    () => readSessionFlag(AGE_OK_KEY),
    () => false,
  );
}

function isDirectHtml5MediaUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|m4v|ogg|ogv)$/.test(pathname);
  } catch {
    return false;
  }
}

function withPosterParam(embedUrl: string, absolutePosterUrl: string | null): string {
  if (!absolutePosterUrl || !absolutePosterUrl.startsWith("https://")) return embedUrl;
  try {
    const parsed = new URL(embedUrl);
    if (!parsed.searchParams.has("poster")) {
      parsed.searchParams.set("poster", absolutePosterUrl);
    }
    return parsed.href;
  } catch {
    return embedUrl;
  }
}

export interface VidaraPlayerProps {
  videoId: string;
  /** Raw Vidara filecode (defensively normalized if a legacy URL was passed). */
  filecode: string;
  title: string;
  embedUrl?: string | null;
  playbackUrl?: string | null;
  shareUrl?: string | null;
  providerStatus?: ProviderStatus;
  fileActive?: boolean | null;
  thumbnailUrl: string | null;
  /** Optional absolute HTTPS poster URL passed to Vidara's inline player when configured. */
  publicPosterUrl?: string | null;
  ageRestricted: boolean;
  ageGateEnabled: boolean;
  /** Optional owner-configured embed URL template containing {filecode}. */
  embedTemplate: string;
}

/**
 * VibePlay inline video player.
 *
 * Loads the verified Vidara inline player directly inside VibePlay without
 * redirecting to Vidara or opening a new browser tab. Supports:
 *  - Native HTML5 `<video>` autoplay (with muted-autoplay fallback + Unmute button)
 *    when a verified direct media URL is provided.
 *  - Vidara's verified official inline player `<iframe>` (`CSP: frame-ancestors *`)
 *    derived strictly from the real URL returned by Vidara's API (never invented).
 *  - Honest Processing / Unavailable states when a video is still encoding or
 *    inactive on Vidara — never renders a broken 404 iframe or fake player.
 */
export function VidaraPlayer(props: VidaraPlayerProps) {
  const {
    videoId,
    filecode,
    title,
    embedUrl = null,
    playbackUrl = null,
    shareUrl = null,
    providerStatus = "ready",
    fileActive = null,
    thumbnailUrl,
    publicPosterUrl = null,
    ageRestricted,
    ageGateEnabled,
    embedTemplate,
  } = props;

  const ageVerified = useAgeVerified();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mutedAutoplayActive, setMutedAutoplayActive] = useState(false);

  // Never display a full URL as a filecode in player diagnostics.
  const displayFilecode = tryExtractVidaraFilecode(filecode) ?? filecode;

  const resolvedUrl = resolveVerifiedInlinePlaybackUrl({
    filecode,
    embedUrl,
    playbackUrl,
    shareUrl,
    providerStatus,
    fileActive,
    embedTemplate,
  });

  const isDirectVideo = Boolean(resolvedUrl && isDirectHtml5MediaUrl(resolvedUrl));

  // If a direct HTML5 video URL is played, attempt audible autoplay first and
  // gracefully fall back to muted autoplay if browser policy blocks sound.
  useEffect(() => {
    if (!isDirectVideo || !videoRef.current) return;
    const el = videoRef.current;
    let cancelled = false;
    el.muted = false;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        if (cancelled) return;
        el.muted = true;
        setMutedAutoplayActive(true);
        el.play().catch(() => {
          /* browser blocked all autoplay; native controls remain ready */
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [isDirectVideo, resolvedUrl, videoId]);

  function acceptAge() {
    writeSessionFlag(AGE_OK_KEY, true);
  }

  function unmuteDirectVideo() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    setMutedAutoplayActive(false);
    el.play().catch(() => undefined);
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

  if (providerStatus === "processing") {
    return (
      <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-amber-500/25 bg-panel px-6 text-center">
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-25 blur-[2px]"
          />
        )}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
          <Clock className="h-6 w-6 text-amber-400" aria-hidden="true" />
        </div>
        <div className="relative space-y-2">
          <Badge tone="amber">Encoding in progress</Badge>
          <h2 className="font-display text-lg font-bold text-white">Video is still processing on Vidara</h2>
          <p className="mx-auto max-w-md text-xs leading-relaxed text-zinc-400">
            Vidara has not confirmed this video is ready for streaming yet. Playback activates
            automatically once encoding finishes and Vidara reports the file active.
          </p>
        </div>
      </div>
    );
  }

  if (!resolvedUrl) {
    return (
      <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-red-500/25 bg-panel px-6 text-center">
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20 blur-[2px]"
          />
        )}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
          <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
        </div>
        <div className="relative space-y-2">
          <Badge tone="red">
            {providerStatus === "blocked" ? "Unavailable / Blocked" : "Stream unavailable"}
          </Badge>
          <h2 className="font-display text-lg font-bold text-white">This video is currently unavailable</h2>
          <p className="mx-auto max-w-md text-xs leading-relaxed text-zinc-400">
            Vidara has not confirmed an active playable stream for filecode{" "}
            <code className="text-zinc-300">{displayFilecode}</code>. Verify its status from Admin → Videos.
          </p>
        </div>
      </div>
    );
  }

  if (isDirectVideo) {
    return (
      <div className="space-y-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
          <video
            key={videoId}
            ref={videoRef}
            src={resolvedUrl}
            poster={thumbnailUrl ?? undefined}
            controls
            autoPlay
            playsInline
            className="h-full w-full bg-black"
          />
          {mutedAutoplayActive && (
            <button
              type="button"
              onClick={unmuteDirectVideo}
              className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/80 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-violet-600 cursor-pointer"
            >
              <VolumeX className="h-4 w-4 text-amber-300" aria-hidden="true" />
              Muted — click to unmute
              <Volume2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const iframeSrc = withPosterParam(resolvedUrl, publicPosterUrl);

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-violet-950/30">
        <iframe
          key={`${videoId}-${iframeSrc}`}
          src={iframeSrc}
          title={title}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <p className="px-1 text-xs text-zinc-500">
        Inline player served via Vidara{ageRestricted ? " · 18+" : ""}. Use player controls for
        play/pause, seek, volume, and fullscreen.
      </p>
    </div>
  );
}
