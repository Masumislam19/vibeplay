// import { handleRoute, jsonOk } from "@/server/lib/http";
// import { assertSameOrigin } from "@/server/lib/origin";
// import { enforceRateLimit, getClientIp } from "@/server/lib/rate-limit";
// import { requireAdminOrThrow } from "@/server/services/auth";
// import { repairVidaraRecords } from "@/server/services/videos";

// export const dynamic = "force-dynamic";

// /**
//  * Verifies every existing Vidara record in MongoDB against Vidara's live
//  * File Info API (`GET /v1/video/info`), updating broken URLs, status, active
//  * state, and fallback thumbnails without deleting or duplicating any records.
//  */
// export async function POST(req: Request) {
//   return handleRoute(async () => {
//     assertSameOrigin(req);
//     const admin = await requireAdminOrThrow();
//     const ip = getClientIp(req);
//     await enforceRateLimit("repair", ip, 10, 60 * 60 * 1000);

//     const summary = await repairVidaraRecords({ adminId: admin.id, ip });
//     return jsonOk(summary);
//   });
// }
