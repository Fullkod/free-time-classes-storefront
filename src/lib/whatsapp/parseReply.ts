import type { RespondAction } from "@/lib/bookings/respond";

/**
 * Parse a free-text WhatsApp reply into a booking action.
 *
 * Tolerant by design: the affirmative/negative word may appear ANYWHERE inside
 * a longer sentence ("sí, confírmame la clase", "lo siento, no puedo"). We
 * tokenize the (accent-stripped) text and count keyword hits on each side; the
 * side with more hits wins. Ties or no hits return null so the caller can ask
 * the tutor to clarify — this avoids guessing on ambiguous replies like
 * "no hay problema, confirmo".
 */
const CONFIRM = new Set([
  "si", "sii", "sip", "ok", "oka", "okay", "okey", "vale", "dale", "claro",
  "perfecto", "confirmar", "confirmo", "confirma", "confirmado", "acepto",
  "aceptar", "aceptado", "yes", "yeah", "yep",
]);

const REJECT = new Set([
  "no", "nop", "nope", "rechazar", "rechazo", "rechaza", "rechazado",
  "cancelar", "cancela", "cancelo", "cancelado", "negativo", "imposible",
]);

// Standalone numeric shortcuts ("1" = confirm, "2" = reject).
const CONFIRM_DIGIT = "1";
const REJECT_DIGIT = "2";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // drop combining accents: "sí" -> "si"
    .normalize("NFC");
}

export function parseReply(body: string): RespondAction | null {
  const raw = (body ?? "").trim();
  if (!raw) return null;

  const normalized = normalize(raw);
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];

  let confirm = 0;
  let reject = 0;

  for (const tok of tokens) {
    if (CONFIRM.has(tok)) confirm++;
    if (REJECT.has(tok)) reject++;
  }

  // Numeric shortcut only when the whole message is just "1" or "2".
  if (tokens.length === 1) {
    if (tokens[0] === CONFIRM_DIGIT) confirm++;
    if (tokens[0] === REJECT_DIGIT) reject++;
  }

  // Emoji thumbs / checks anywhere in the text.
  if (/[👍✅]/u.test(raw)) confirm++;
  if (/[👎❌]/u.test(raw)) reject++;

  if (confirm > reject) return "confirm";
  if (reject > confirm) return "reject";
  return null;
}

/**
 * Booking code in a reply ("SÍ 47", "no #47") so a tutor with several pending
 * requests can say which one (F071). A message that is only "1" or "2" is the
 * numeric shortcut, not a code. Several different numbers = no code.
 */
export function parseBookingCode(body: string): number | null {
  const tokens = normalize((body ?? "").trim()).match(/[a-z0-9]+/g) ?? [];
  if (tokens.length === 1 && (tokens[0] === CONFIRM_DIGIT || tokens[0] === REJECT_DIGIT)) {
    return null;
  }
  const numbers = new Set(tokens.filter((tok) => /^\d{1,9}$/.test(tok)).map(Number));
  return numbers.size === 1 ? [...numbers][0] : null;
}
