import { SettingsForm } from "@/components/admin/settings-form";

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">
        Settings<span className="vibe-text">.</span>
      </h1>
      <p className="mb-6 text-sm text-zinc-500">Branding, social links, safety, ads and the player.</p>
      <SettingsForm />
    </div>
  );
}
