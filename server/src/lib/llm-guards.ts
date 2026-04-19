/**
 * LLM output guards. Used by summary pipelines to reject outputs that look
 * like the model refused, asked for clarification, or got confused — so we
 * don't ship "I don't have access to..." straight into a Telegram briefing
 * or cache it to the daily_summaries table.
 */

const REFUSAL_PATTERNS: RegExp[] = [
  /^i\s+(don'?t|do not|can'?t|cannot)\s+(have|see|access|know|help|provide|determine)/i,
  /^i\s+apologize/i,
  /^i'?m\s+(sorry|unable)/i,
  /^sorry[,.]?\s+(but|i)/i,
  /^could\s+you\s+(please\s+)?(provide|share|tell|give|clarify)/i,
  /^it\s+(seems|appears|looks)\s+(like|that)\s+/i,
  /^i\s+(would|need)\s+(to|more)/i,
  /^unfortunately/i,
];

/**
 * Returns true if the text looks like an LLM refusal, clarification request,
 * or is too short to be useful (< 30 chars). Empty/whitespace strings also
 * return true so callers can treat "no output" the same as "bad output".
 */
export function looksLikeRefusal(text: string | null | undefined): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 30) return true;
  return REFUSAL_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Detects whether a fetched-article string is binary garbage (e.g. raw PDF
 * bytes that slipped through HTML stripping). Heuristic: printable-ASCII
 * ratio below 70% over the first 1000 chars.
 */
export function looksLikeBinary(text: string | null | undefined): boolean {
  if (!text || text.length < 100) return false;
  const sampleSize = Math.min(1000, text.length);
  let printable = 0;
  for (let i = 0; i < sampleSize; i++) {
    const c = text.charCodeAt(i);
    if ((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d) printable++;
  }
  return printable / sampleSize < 0.7;
}

/**
 * Cleans a raw LLM summary response. Strips leading markdown headers
 * (`# Whatever`) and common preambles ("Summary:", "TL;DR:") so the text
 * we display/store starts with the actual summary content.
 */
export function cleanSummary(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .trim()
    .replace(/^#+\s+[^\n]*\n+/gm, "")
    .replace(/^(summary|tldr|tl;dr)\s*[:.]\s*/i, "")
    .trim();
}
