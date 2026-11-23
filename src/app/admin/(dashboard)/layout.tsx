import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/server/services/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin" };

/** Every page inside this layout requires a valid server-side admin session. */
export default async function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");
  return <AdminShell adminEmail={admin.email}>{children}</AdminShell>;
}
