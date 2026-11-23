/** Shared fetch wrapper for admin client components — surfaces server error messages. */
export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (HTTP ${res.status}).`;
    throw new Error(message);
  }
  const withError = body as { error?: string };
  if (withError?.error) throw new Error(withError.error);
  return body as T;
}
