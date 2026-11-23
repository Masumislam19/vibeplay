"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Film, Flag, FolderTree, LayoutDashboard, LoaderCircle, LogOut, Menu, Settings, Upload, X } from "lucide-react";
import { VibeLogo } from "@/components/logo";
import { buttonClasses } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/videos", label: "Videos", icon: Film },
  { href: "/admin/import", label: "Upload", icon: Upload },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ adminEmail, children }: { adminEmail: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  }

  const navList = (
    <nav className="flex-1 space-y-1 px-3" aria-label="Admin navigation">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
            isActive(item.href)
              ? "bg-violet-500/15 text-violet-200"
              : "text-zinc-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <item.icon className="h-4 w-4" aria-hidden="true" />
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/8 p-4">
      <p className="truncate text-xs text-zinc-500" title={adminEmail}>{adminEmail}</p>
      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        className={`mt-3 w-full ${buttonClasses("ghost", "sm")} cursor-pointer`}
      >
        {loggingOut ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-[70vh]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/8 bg-abyss/85 backdrop-blur lg:flex">
        <div className="flex h-16 items-center border-b border-white/8 px-5">
          <Link href="/" aria-label="Back to site">
            <VibeLogo markClass="h-8 w-8" textClass="text-lg" />
          </Link>
        </div>
        <div className="flex flex-1 flex-col pt-4">
          {navList}
          {footer}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/8 glass px-4 lg:hidden">
        <Link href="/admin">
          <VibeLogo markClass="h-8 w-8" textClass="text-lg" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open admin menu"
          className="rounded-lg p-2 text-zinc-300 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden animate-fade-in" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/70 cursor-default" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-abyss shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-white/8 px-4">
              <VibeLogo markClass="h-8 w-8" textClass="text-lg" />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-1 flex-col pt-3">
              {navList}
              {footer}
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-60">{children}</div>
    </div>
  );
}
