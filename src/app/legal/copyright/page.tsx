import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copyright Policy" };

export default async function CopyrightPage() {
  const s = await getSettings();
  return (
    <LegalPage
      title="Copyright Policy"
      updated="2026"
      intro={`${s.siteName} respects intellectual property rights and responds promptly to valid copyright complaints. If you believe content on this platform infringes your rights, use the process below.`}
      sections={[
        {
          heading: "1. Reporting infringement",
          body: (
            <>
              <p>Send a notice to <a className="text-violet-300 hover:underline" href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a> that includes:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Identification of the copyrighted work you claim has been infringed.</li>
                <li>The URL of the video on {s.siteName} (the /watch/… link).</li>
                <li>Your contact information (email is sufficient).</li>
                <li>A statement that you have a good-faith belief the use is unauthorized.</li>
                <li>A statement, under penalty of perjury, that the information is accurate and you are the rights holder or authorized to act for them.</li>
                <li>Your physical or electronic signature.</li>
              </ul>
              <p>
                You can also use the <strong>Report</strong> button on any video page and choose
                “Copyright infringement” for faster routing.
              </p>
            </>
          ),
        },
        {
          heading: "2. What happens next",
          body: (
            <p>
              Valid notices are actioned without undue delay: the reported video is typically
              unpublished immediately pending review, and where infringement is confirmed its video
              and thumbnail objects are deleted from Supabase Storage and the record is removed from{" "}
              {s.siteName}.
            </p>
          ),
        },
        {
          heading: "3. Counter-notice",
          body: (
            <p>
              If your video was removed by mistake or misidentification, you may submit a
              counter-notice with the same completeness requirements. Valid counter-notices
              restore the content unless the original complainant files a court action.
            </p>
          ),
        },
        {
          heading: "4. Repeat infringers",
          body: (
            <p>
              Access is terminated for users (including collaborators of the platform owner) who
              are repeat infringers of copyright.
            </p>
          ),
        },
        {
          heading: "5. Misuse of this process",
          body: (
            <p>
              Knowingly submitting false infringement claims may expose you to liability for
              damages, including costs and legal fees.
            </p>
          ),
        },
      ]}
    />
  );
}
