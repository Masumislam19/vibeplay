import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Database, ShieldCheck } from "lucide-react";
import { isMongoConfigured } from "@/db";
import { LoginForm } from "@/components/admin/login-form";
import {
  AUTHORIZED_OWNER_EMAIL,
  getAdminCount,
  isSetupConfigured,
  requireAdmin,
} from "@/server/services/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in" };

export default async function AdminLoginPage() {
  const dbConfigured = isMongoConfigured();
  const setupConfigured = await isSetupConfigured();

  let session = null;
  let adminExists = false;
  let dbError: string | null = null;

  if (dbConfigured) {
    try {
      const [s, count] = await Promise.all([requireAdmin(), getAdminCount()]);
      session = s;
      adminExists = count > 0;
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Could not reach MongoDB Atlas.";
    }
  }

  if (session !== null) redirect("/admin");

  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/12">
          <ShieldCheck className="h-6 w-6 text-violet-400" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold text-white">Admin sign in</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Single-owner access restricted to{" "}
          <span className="text-zinc-300">{AUTHORIZED_OWNER_EMAIL}</span>. No public registration.
        </p>
      </div>

      {!dbConfigured && (
        <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1.5">
            <p className="font-semibold">MongoDB Atlas is not configured on this server.</p>
            <p>
              Set <code className="text-amber-100">MONGODB_URI</code> and{" "}
              <code className="text-amber-100">MONGODB_DB_NAME=vibeplay</code> in Netlify (Site
              configuration → Environment variables) or in your local <code className="text-amber-100">.env</code>{" "}
              file, then redeploy or restart.
            </p>
          </div>
        </div>
      )}

      {dbError && (
        <div className="flex gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{dbError}</span>
        </div>
      )}

      {dbConfigured && !dbError && !adminExists && setupConfigured && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
          No owner account exists yet.{" "}
          <Link href="/admin/setup" className="font-semibold underline underline-offset-2">
            Run one-time owner setup
          </Link>{" "}
          with your <code className="text-violet-100">ADMIN_SETUP_KEY</code>.
        </div>
      )}

      {!adminExists && !setupConfigured && (
        <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1.5">
            <p className="font-semibold">
              Owner setup is disabled because ADMIN_SETUP_KEY is not configured on this server.
            </p>
            <p>
              In Netlify, go to <strong>Site configuration → Environment variables → Add a variable</strong>,
              add <code className="text-amber-100">ADMIN_SETUP_KEY</code> (e.g. generated with{" "}
              <code className="text-amber-100">openssl rand -hex 24</code>), trigger a new deploy,
              and open <code className="text-amber-100">/admin/setup</code>. Never hardcode this key
              in source code.
            </p>
          </div>
        </div>
      )}

      {dbConfigured && !dbError && adminExists && (
        <LoginForm authorizedOwnerEmail={AUTHORIZED_OWNER_EMAIL} />
      )}
    </div>
  );
}
