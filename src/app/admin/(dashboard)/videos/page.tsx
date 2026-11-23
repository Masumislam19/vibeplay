import { VideoManager } from "@/components/admin/video-manager";

export default function AdminVideosPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">
        Videos<span className="vibe-text">.</span>
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Every video in your catalog — edit, publish, feature, refresh metadata, or remove.
      </p>
      <VideoManager />
    </div>
  );
}
