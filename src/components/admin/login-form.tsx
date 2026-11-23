"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HelpCircle, LoaderCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { apiRequest } from "@/lib/admin-client";

export function LoginForm({ authorizedOwnerEmail }: { authorizedOwnerEmail: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryResult, setRecoveryResult] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    setLoading(true);
    try {
      await apiRequest("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setLoading(false);
    }
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setRecoveryError(null);
    setRecoveryResult(null);
    setRecoveryLoading(true);
    try {
      const res = await apiRequest<{ message: string }>("/api/admin/recovery", {
        method: "POST",
        body: JSON.stringify({ email: recoveryEmail }),
      });
      setRecoveryResult(res.message);
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : "Recovery request failed.");
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-white/10 bg-panel/80 p-6 shadow-xl shadow-violet-950/20"
      >
        <div>
          <Label htmlFor="login-email">Owner email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={authorizedOwnerEmail}
          />
        </div>
        <div>
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••••••"
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
            <LogIn className="h-4 w-4" aria-hidden="true" />
          )}
          Sign in
        </Button>

        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setShowRecovery((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-violet-300 cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {showRecovery ? "Hide password recovery" : "Forgot owner password?"}
          </button>
        </div>
      </form>

      {showRecovery && (
        <form
          onSubmit={submitRecovery}
          className="space-y-3 rounded-2xl border border-white/10 bg-panel/70 p-5"
        >
          <p className="text-xs leading-relaxed text-zinc-400">
            Recovery is restricted exclusively to the authorized owner email. Enter the owner email
            to view the recovery procedure.
          </p>
          <div>
            <Label htmlFor="recovery-email">Authorized owner email</Label>
            <Input
              id="recovery-email"
              type="email"
              required
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder={authorizedOwnerEmail}
            />
          </div>
          {recoveryError && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {recoveryError}
            </p>
          )}
          {recoveryResult && (
            <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs leading-relaxed text-cyan-200">
              {recoveryResult}
            </p>
          )}
          <Button type="submit" variant="ghost" size="sm" disabled={recoveryLoading}>
            {recoveryLoading && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Request recovery instructions
          </Button>
        </form>
      )}
    </div>
  );
}
