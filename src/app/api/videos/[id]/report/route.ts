import { z } from "zod";
import { handleRoute, jsonOk } from "@/server/lib/http";
import { assertSameOrigin } from "@/server/lib/origin";
import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
import { createReport } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const REASONS = [
  "copyright",
  "illegal-content",
  "minor-safety",
  "adult-misclassification",
  "broken-playback",
  "other",
] as const;

const reportSchema = z.object({
  reason: z.enum(REASONS),
  details: z.string().max(2000).optional(),
  contactEmail: z.string().max(255).optional(),
});

/** Public content-report workflow. Rate limited and validated. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const { id } = await params;
    const ip = getClientIp(req);
    await enforceRateLimit("report", ip, 8, 60 * 60 * 1000);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) {
      throw new (await import("@/server/lib/http")).HttpError(400, "Please provide a valid report reason.");
    }

    await createReport({
      videoId: id,
      reason: parsed.data.reason,
      details: parsed.data.details,
      contactEmail: parsed.data.contactEmail,
    });
    return jsonOk({ received: true }, 201);
  });
}
