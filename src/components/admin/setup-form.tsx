"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { apiRequest } from "@/lib/admin-client";

export function SetupForm({ authorizedOwnerEmail }: { authorizedOwnerEmail: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);

    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setError("Password and password confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/admin/setup", {
        method: "POST",
        body: JSON.stringify({
          setupKey: String(data.get("setupKey") ?? ""),
          email: String(data.get("email") ?? ""),
          password,
          confirmPassword,
        }),
      });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-white/10 bg-panel/80 p-6 shadow-xl shadow-violet-950/20"
    >
      <div>
        <Label htmlFor="setup-key">One-time admin setup key</Label>
        <Input
          id="setup-key"
          name="setupKey"
          type="password"
          required
          autoComplete="off"
          placeholder="Your server-side ADMIN_SETUP_KEY"
        />
        <p className="mt-1.5 text-[11px] text-zinc-500">
          Verified once against <code className="text-zinc-300">ADMIN_SETUP_KEY</code>. This is not
          your normal login password.
        </p>
      </div>
      <div>
        <Label htmlFor="setup-email">Authorized owner email</Label>
        <Input
          id="setup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={authorizedOwnerEmail}
          placeholder={authorizedOwnerEmail}
        />
        <p className="mt-1.5 text-[11px] text-zinc-500">
          Server-enforced single owner: only <strong className="text-zinc-300">{authorizedOwnerEmail}</strong> is
          permitted. All other email addresses are rejected.
        </p>
      </div>
      <div>
        <Label htmlFor="setup-password">Owner password</Label>
        <Input
          id="setup-password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          placeholder="At least 12 characters (letters + numbers)"
        />
        <p className="mt-1.5 text-[11px] text-zinc-500">
          Minimum 12 characters containing at least one letter and one number. Hashed with scrypt.
        </p>
      </div>
      <div>
        <Label htmlFor="setup-confirm">Confirm owner password</Label>
        <Input
          id="setup-confirm"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          placeholder="Repeat password"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        )}
        Create owner account
      </Button>
    </form>
  );
}
