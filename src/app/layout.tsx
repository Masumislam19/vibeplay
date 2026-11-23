import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Sora } from "next/font/google";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSettings } from "@/server/services/settings";
import "./globals.css";
import AgeGate from "@/components/age-gate";
import HilltopAdsZone from "@/components/hilltopads-zone";


const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#06060c",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const siteUrl = process.env.SITE_URL?.trim();
  return {

    // SITE_URL makes canonical/OpenGraph URLs absolute in production.
    metadataBase: siteUrl ? new URL(siteUrl) : undefined,
    title: {
      default: `${settings.siteName} — ${settings.siteTagline}`,
      template: `%s · ${settings.siteName}`,
    },
    description: settings.siteDescription,
    alternates: siteUrl ? { canonical: "/" } : undefined,
    openGraph: {
      title: `${settings.siteName} — ${settings.siteTagline}`,
      description: settings.siteDescription,
      type: "website",
      siteName: settings.siteName,
      url: siteUrl || undefined,
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`}>
      <body className="font-body antialiased">
        {/* Ambient cinematic glow */}
        <AgeGate />
        <HilltopAdsZone />
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-violet-700/12 blur-[140px]" />
          <div className="absolute right-[-180px] top-1/3 h-[380px] w-[380px] rounded-full bg-cyan-500/8 blur-[130px]" />
          <div className="absolute bottom-[-160px] left-[-120px] h-[320px] w-[420px] rounded-full bg-purple-700/10 blur-[120px]" />
        </div>

        <Navbar siteName={settings.siteName} logoUrl={settings.logoUrl} />
        <div className="mx-auto w-full max-w-7xl px-4">
        {/* <AdSlot settings={settings} slot="adHomeHtml" /> */}
        </div>
        
        <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
          {children}
        </main>
        <Footer settings={settings} />
      </body>
    </html>
  );
}
