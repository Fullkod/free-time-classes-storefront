/**
 * OpenWA (WhatsApp gateway) client — outbound only.
 *
 * Thin REST wrapper over an OpenWA instance. Server-side only: reads the
 * API key from env, so never import this from client components.
 *
 * Tolerates the two response shapes OpenWA returns in the wild
 * (`{success,data}` vs the flat `{messageId,timestamp}`) and the
 * country-code duplication trap. See docs/OPENWA_INTEGRATION_GUIDE.md §4, §8.
 */

const BASE_URL = process.env.OPENWA_BASE_URL ?? "";
const API_KEY = process.env.OPENWA_API_KEY ?? "";
const SESSION_ID = process.env.OPENWA_SESSION_ID ?? "";

/** True only when every env var needed to send is present. */
export function isOpenWaConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY && SESSION_ID);
}

export interface OpenWaResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

/**
 * Build a WhatsApp chatId, tolerating both international format (`+34...`)
 * and a separately-stored country code. Avoids the double-country-code trap
 * that produces non-existent numbers (guide §4.4).
 */
export function phoneToChatId(phone: string, countryCode = ""): string {
  const raw = (phone ?? "").trim();
  if (raw.startsWith("+")) return `${raw.slice(1).replace(/[^\d]/g, "")}@c.us`;
  const num = raw.replace(/[^\d]/g, "");
  const cc = countryCode.replace(/[^\d]/g, "");
  const full = !cc || num.startsWith(cc) ? num : `${cc}${num}`;
  return `${full}@c.us`;
}

// A hung VPS must never block the API route that triggered the message.
const REQUEST_TIMEOUT_MS = 4000;

async function call<T>(path: string, init: RequestInit): Promise<OpenWaResult<T>> {
  if (!isOpenWaConfigured()) {
    return {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "OpenWA env vars are missing." },
    };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      success: false,
      error: { code: timedOut ? "TIMEOUT" : "NETWORK_ERROR", message: String(err) },
    };
  }

  const text = await res.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      success: false,
      error: { code: "INVALID_RESPONSE", message: text.slice(0, 300) },
    };
  }

  // Explicit error or non-2xx
  if (!res.ok || raw.success === false) {
    return {
      success: false,
      error: {
        code: String(raw.error ?? raw.code ?? `HTTP_${res.status}`),
        message: String(raw.message ?? raw.error ?? res.statusText),
        details: raw,
      },
    };
  }

  // Success: shape A {success,data} or shape B {messageId,...}
  if (raw.success === true && raw.data !== undefined) {
    return raw as unknown as OpenWaResult<T>;
  }
  return { success: true, data: raw as T };
}

/** Send a plain-text WhatsApp message to a chatId (e.g. "34600111222@c.us"). */
export function sendText(chatId: string, text: string) {
  return call<{ messageId?: string; timestamp?: number }>(
    `/sessions/${SESSION_ID}/messages/send-text`,
    { method: "POST", body: JSON.stringify({ chatId, text }) }
  );
}
