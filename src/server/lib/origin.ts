import { HttpError } from "./http";

/**
 * CSRF protection for state-changing (POST/PATCH/PUT/DELETE) cookie-authenticated
 * requests. Browsers always attach an Origin header to cross-origin requests, so
 * a mismatched Origin is rejected. Non-browser clients without an Origin pass.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // server-to-server / curl — no browser CSRF risk
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) throw new HttpError(403, "Request origin could not be verified.");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Request origin is malformed.");
  }
  if (originHost !== host) {
    throw new HttpError(403, "Request origin does not match the site host.");
  }
}
