import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const s = await getSettings();
  return (
    <LegalPage
      title="Privacy Policy"
      updated="2026"
      intro={`${s.siteName} collects as little personal data as possible. This policy explains what is stored, why, and for how long. Video files and thumbnails are stored in Supabase Storage and application metadata in MongoDB Atlas.`}
      sections={[
        {
          heading: "1. What we collect",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>View analytics:</strong> a daily, privacy-preserving hash of IP address, browser user-agent and date is used to count unique views. Raw IP addresses are never stored for views.</li>
              <li><strong>Admin sessions:</strong> when the owner signs in, a session record (hashed token, IP, user-agent) is stored to authenticate protected pages.</li>
              <li><strong>Security audit log:</strong> administrative actions are recorded with a truncated IP for security auditing.</li>
              <li><strong>Reports:</strong> if you submit a report, the reason, details and any contact email you choose to provide are stored so the owner can follow up.</li>
            </ul>
          ),
        },
        {
          heading: "2. Cookies",
          body: (
            <p>
              {s.siteName} uses one strictly necessary cookie when the owner signs in: an HTTP-only
              session cookie required for admin authentication. No advertising or tracking cookies
              are set by {s.siteName} itself. If advertisement scripts are enabled by the owner,
              those third parties may set their own cookies — see their policies.
            </p>
          ),
        },
        {
          heading: "3. Third parties",
          body: (
            <p>
              Video and thumbnail delivery is provided by Supabase Storage, and application records
              are stored in MongoDB Atlas. When you play a video, your browser streams the MP4 file
              directly from Supabase Storage under Supabase&apos;s infrastructure terms. No other
              third-party processors are used unless the owner enables optional advertisement scripts.
            </p>
          ),
        },
        {
          heading: "4. Data retention",
          body: (
            <p>
              View records and audit logs are retained for operational and security purposes and
              can be removed on request. Report records are retained until resolved and then may
              be deleted. Expired admin sessions are purged automatically.
            </p>
          ),
        },
        {
          heading: "5. Your rights",
          body: (
            <p>
              You may request access to, correction of, or deletion of your personal data by
              contacting <a className="text-violet-300 hover:underline" href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>. We will respond within a reasonable timeframe.
            </p>
          ),
        },
        {
          heading: "6. Contact",
          body: (
            <p>
              Privacy questions: <a className="text-violet-300 hover:underline" href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>
            </p>
          ),
        },
      ]}
    />
  );
}
