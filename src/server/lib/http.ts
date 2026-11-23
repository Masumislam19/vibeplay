import { NextResponse } from "next/server";

/**
 * Consistent JSON responses and HTTP error handling for all API routes.
 */

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as object, { status });
}

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wraps a route handler so thrown HttpErrors become clean JSON responses and
 * unexpected failures never leak internals to the client.
 */
export async function handleRoute<T>(fn: () => Promise<NextResponse<T>>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.status, error.message);
    }
    console.error("[vibeplay] unexpected route error:", error instanceof Error ? error.message : error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
