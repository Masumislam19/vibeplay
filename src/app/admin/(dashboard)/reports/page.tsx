import { ReportManager } from "@/components/admin/report-manager";

export default function AdminReportsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">
        Reports<span className="vibe-text">.</span>
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Review visitor reports. Copyright and child-safety reports deserve fastest handling.
      </p>
      <ReportManager />
    </div>
  );
}
