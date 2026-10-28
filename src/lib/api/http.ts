/**
 * Request/response helpers for route handlers (F090).
 */

/** JSON object body, or null when it is missing or malformed (answer 400, not 500). */
export async function readJson<T>(request: Request): Promise<Partial<T> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Partial<T>) : null;
  } catch {
    return null;
  }
}

/** Logs a database error and returns a body that does not expose its details. */
export function publicError(error: unknown, message: string): { error: string } {
  if (error) console.error("[api]", message, error);
  return { error: message };
}
