import { DashboardOverview } from "@/components/admin/dashboard-overview";

export default function AdminOverviewPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">
        Dashboard<span className="vibe-text">.</span>
      </h1>
      <p className="mb-6 text-sm text-zinc-500">Real metrics from MongoDB Atlas and Supabase Storage.</p>
      <DashboardOverview />
    </div>
  );
}
