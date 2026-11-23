"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut, Megaphone, Save, ShieldAlert, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Toggle } from "@/components/ui/form";
import { apiRequest } from "@/lib/admin-client";

interface SettingsShape {
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  contactEmail: string;
  logoUrl: string;
  socialTwitter: string;
  socialYoutube: string;
  socialInstagram: string;
  ageGateEnabled: boolean;
  adsEnabled: boolean;
  adHomeHtml: string;
  adListHtml: string;
  adWatchHtml: string;
}

function Section({
  title,
  icon: Icon,
  hint,
  children,
}: {
  title: string;
  icon: typeof Save;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel/80 p-5">
      <div className="mb-4">
        <h2 className="inline-flex items-center gap-2 font-display font-bold text-white">
          <Icon className="h-4 w-4 text-violet-400" aria-hidden="true" /> {title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{hint}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function SettingsForm() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    apiRequest<SettingsShape>("/api/admin/settings")
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load settings."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  function update<K extends keyof SettingsShape>(key: K, value: SettingsShape[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeAll() {
    setRevoking(true);
    try {
      await apiRequest("/api/admin/sessions/revoke", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed.");
      setRevoking(false);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-500">Loading settings…</p>;
  }
  if (!settings) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error ?? "Settings unavailable."}
      </p>
    );
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Section title="Branding" icon={Sparkles} hint="Site identity used across the navbar, footer, SEO metadata and empty states.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-siteName">Site name</Label>
            <Input id="s-siteName" value={settings.siteName} onChange={(e) => update("siteName", e.target.value)} required maxLength={80} />
          </div>
          <div>
            <Label htmlFor="s-tagline">Tagline</Label>
            <Input id="s-tagline" value={settings.siteTagline} onChange={(e) => update("siteTagline", e.target.value)} maxLength={120} />
          </div>
        </div>
        <div>
          <Label htmlFor="s-description">Site description</Label>
          <Textarea id="s-description" value={settings.siteDescription} onChange={(e) => update("siteDescription", e.target.value)} maxLength={300} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-contact">Contact email</Label>
            <Input id="s-contact" type="email" value={settings.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} maxLength={255} />
          </div>
          <div>
            <Label htmlFor="s-logo">Custom logo URL (optional)</Label>
            <Input id="s-logo" value={settings.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} maxLength={500} placeholder="https://…/logo.png" />
          </div>
        </div>
      </Section>

      <Section title="Social links" icon={Users} hint="Shown in the footer. Leave empty to hide an icon.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="s-twitter">X / Twitter URL</Label>
            <Input id="s-twitter" value={settings.socialTwitter} onChange={(e) => update("socialTwitter", e.target.value)} maxLength={300} placeholder="https://x.com/…" />
          </div>
          <div>
            <Label htmlFor="s-youtube">YouTube URL</Label>
            <Input id="s-youtube" value={settings.socialYoutube} onChange={(e) => update("socialYoutube", e.target.value)} maxLength={300} placeholder="https://youtube.com/@…" />
          </div>
          <div>
            <Label htmlFor="s-instagram">Instagram URL</Label>
            <Input id="s-instagram" value={settings.socialInstagram} onChange={(e) => update("socialInstagram", e.target.value)} maxLength={300} placeholder="https://instagram.com/…" />
          </div>
        </div>
      </Section>

      <Section
        title="Age gate"
        icon={ShieldAlert}
        hint="Shows an 18+ confirmation screen before playing age-restricted videos. This is a self-declaration, not legally verified age verification."
      >
        <Toggle
          checked={settings.ageGateEnabled}
          onChange={(v) => update("ageGateEnabled", v)}
          label="Enable the 18+ confirmation gate for age-restricted videos"
        />
      </Section>

      <Section
        title="Advertisements"
        icon={Megaphone}
        hint="Disabled by default. When enabled, the owner-provided scripts render in the homepage, list and watch slots. Avoid deceptive links, forced redirects and duplicate third-party scripts."
      >
        <Toggle checked={settings.adsEnabled} onChange={(v) => update("adsEnabled", v)} label="Enable advertisement slots" />
        <div className="grid gap-4">
          <div>
            <Label htmlFor="s-ad-home">Homepage banner (HTML/script)</Label>
            <Textarea id="s-ad-home" value={settings.adHomeHtml} onChange={(e) => update("adHomeHtml", e.target.value)} className="font-mono text-xs" maxLength={10000} placeholder="<script src='https://…'></script>" />
          </div>
          <div>
            <Label htmlFor="s-ad-list">Video-list / sidebar slot (HTML/script)</Label>
            <Textarea id="s-ad-list" value={settings.adListHtml} onChange={(e) => update("adListHtml", e.target.value)} className="font-mono text-xs" maxLength={10000} />
          </div>
          <div>
            <Label htmlFor="s-ad-watch">Watch-page slot (HTML/script)</Label>
            <Textarea id="s-ad-watch" value={settings.adWatchHtml} onChange={(e) => update("adWatchHtml", e.target.value)} className="font-mono text-xs" maxLength={10000} />
          </div>
        </div>
      </Section>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          Save settings
        </Button>
        {saved && <span className="text-sm font-semibold text-emerald-400">Saved.</span>}
      </div>

      <Section
        title="Security"
        icon={LogOut}
        hint="Revoke every active admin session (all devices, including this one). You will be signed out immediately."
      >
        <Button type="button" variant="danger" onClick={revokeAll} disabled={revoking}>
          {revoking && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Revoke all sessions
        </Button>
      </Section>
    </form>
  );
}
