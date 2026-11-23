import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Database, KeyRound } from "lucide-react";
import { isMongoConfigured } from "@/db";
import { SetupForm } from "@/components/admin/setup-form";
import {
  AUTHORIZED_OWNER_EMAIL,
  getAdminCount,
  isSetupConfigured,
} from "@/server/services/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Owner setup" };

export default async function AdminSetupPage() {
  const dbConfigured = isMongoConfigured();
  const setupConfigured = await isSetupConfigured();

  let dbError: string | null = null;
  if (dbConfigured) {
    try {
      const adminExists = (await getAdminCount()) > 0;
      if (adminExists) redirect("/admin/login");
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Could not reach MongoDB Atlas.";
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/12">
          <KeyRound className="h-6 w-6 text-violet-400" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold text-white">One-time owner setup</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Create the single authorized owner account (
          <span className="text-zinc-300">{AUTHORIZED_OWNER_EMAIL}</span>). Once created, public
          owner setup is permanently disabled.
        </p>
      </div>

      {!dbConfigured && (
        <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1.5">
            <p className="font-semibold">MongoDB Atlas is not configured on this server.</p>
            <p>
              Add <code className="text-amber-100">MONGODB_URI</code> and{" "}
              <code className="text-amber-100">MONGODB_DB_NAME=vibeplay</code> in Netlify (Site
              configuration → Environment variables) before creating the owner account.
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

      {!setupConfigured ? (
        <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1.5">
            <p className="font-semibold">
              Owner setup is disabled because ADMIN_SETUP_KEY is not configured on this server.
            </p>
            <p>
              To enable first-time setup on Netlify: open your site →{" "}
              <strong>Site configuration → Environment variables → Add a variable</strong> → set
              key <code className="text-amber-100">ADMIN_SETUP_KEY</code> to a long random secret
              (e.g. <code className="text-amber-100">openssl rand -hex 24</code>) → trigger a
              redeploy → return to <code className="text-amber-100">/admin/setup</code>.
            </p>
          </div>
        </div>
      ) : dbConfigured && !dbError ? (
        <SetupForm authorizedOwnerEmail={AUTHORIZED_OWNER_EMAIL} />
      ) : null}
    </div>
  );
}
