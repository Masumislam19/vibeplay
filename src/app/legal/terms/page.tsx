import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms & Conditions" };

export default async function TermsPage() {
  const s = await getSettings();
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="2026"
      intro={`These Terms govern your use of ${s.siteName}. By accessing or using the platform you agree to them. ${s.siteName} is a video streaming platform storing media in Supabase Storage and application data in MongoDB Atlas.`}
      sections={[
        {
          heading: "1. The service",
          body: (
            <p>
              {s.siteName} lets visitors discover and watch videos that the platform owner has
              published directly inside VibePlay&apos;s native HTML5 player. Media files are served
              from Supabase Storage. Features may change or be discontinued at any time without notice.
            </p>
          ),
        },
        {
          heading: "2. Acceptable use",
          body: (
            <>
              <p>You agree not to:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Use the platform for any unlawful purpose or to distribute illegal content.</li>
                <li>Upload, link or distribute content that exploits or endangers minors — such content is absolutely prohibited and will be removed and reported.</li>
                <li>Attempt to bypass age-restriction controls or misrepresent your age.</li>
                <li>Interfere with the service, scrape at abusive rates, or attempt unauthorized access to admin systems.</li>
                <li>Misrepresent your identity when submitting reports or takedown notices.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "3. Content and responsibility",
          body: (
            <p>
              All content published on {s.siteName} is uploaded by the platform owner, who is solely
              responsible for holding the necessary rights, licenses and permissions for every
              video, and for correctly classifying adult material (18+ content must be marked
              age-restricted). {s.siteName} does not claim ownership of published videos.
            </p>
          ),
        },
        {
          heading: "4. Age-restricted content",
          body: (
            <p>
              Videos marked 18+ are gated behind a self-declaration screen when the age gate is
              enabled. This confirmation is <strong>not</strong> a legally verified age-verification
              check, and access should be supervised where required by your local law.
            </p>
          ),
        },
        {
          heading: "5. Availability and limitation of liability",
          body: (
            <p>
              The service is provided “as is” without warranties of any kind. Video availability
              depends on Supabase Storage and hosting uptime. To the maximum extent permitted by
              law, the platform owner is not liable for indirect or consequential damages arising
              from your use of the service.
            </p>
          ),
        },
        {
          heading: "6. Termination",
          body: (
            <p>
              Access may be suspended or terminated for violation of these Terms, for legal
              compliance, or for handling of infringing or illegal content.
            </p>
          ),
        },
        {
          heading: "7. Contact",
          body: (
            <p>
              Questions about these Terms: <a className="text-violet-300 hover:underline" href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>
            </p>
          ),
        },
      ]}
    />
  );
}
