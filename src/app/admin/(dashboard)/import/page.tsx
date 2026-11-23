import { ImportManager } from "@/components/admin/import-manager";

export const dynamic = "force-dynamic";

export default async function AdminImportPage({
  searchParams,
}: {
  searchParams: Promise<{ replace?: string }>;
}) {
  const sp = await searchParams;
  const replaceVideoId = sp.replace?.trim() || null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">
        {replaceVideoId ? "Replace Video File" : "Upload Video"}
        <span className="vibe-text">.</span>
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        {replaceVideoId
          ? "Upload a replacement MP4 to Supabase Storage while preserving this record's existing metadata and views."
          : "Select an MP4 video from your PC or mobile gallery. Thumbnails are extracted automatically and stored in Supabase Storage."}
      </p>
      <ImportManager key={replaceVideoId ?? "new"} replaceVideoId={replaceVideoId} />
    </div>
  );
}
