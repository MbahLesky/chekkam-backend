import crypto from "node:crypto";

const URL_PATTERN = /https?:\/\/[^\s)>\]]+/gi;
// Loose match for Cameroonian mobile numbers (MTN/Orange prefixes), with or without +237.
const PHONE_PATTERN = /(?:\+?237)?[\s.-]?6\d(?:[\s.-]?\d){7}/g;
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "are", "you", "your",
  "le", "la", "les", "de", "du", "et", "un", "une", "des", "au", "aux",
]);

export type Fingerprint = {
  urls: string[];
  phoneNumbers: string[];
  normalizedText: string;
  textHash: string;
};

/**
 * Strips whitespace/punctuation and a leading country code, leaving the bare
 * 9-digit local number — "+237 677 12 34 56", "237677123456", and
 * "677123456" must all normalize identically, or the same number written two
 * ways looks like two different numbers to campaign matching and number-
 * reputation lookups (Phase 12).
 */
export function normalizeCameroonNumber(raw: string): string {
  return raw.replace(/[\s.\-()]/g, "").replace(/^\+?237/, "");
}

/** Extracts links, phone numbers, and a normalized text fingerprint. SRS FR-030. */
export function extractFingerprint(content: string): Fingerprint {
  const urls = dedupe(
    Array.from(content.matchAll(URL_PATTERN)).map((m) => normalizeUrl(m[0]))
  );
  const phoneNumbers = dedupe(
    Array.from(content.matchAll(PHONE_PATTERN)).map((m) => normalizeCameroonNumber(m[0]))
  );
  const normalizedText = normalizeText(content);
  const textHash = crypto.createHash("sha256").update(normalizedText).digest("hex");
  return { urls, phoneNumbers, normalizedText, textHash };
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, "");
}

function normalizeText(content: string): string {
  return content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (combining diacritical marks)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .sort()
    .join(" ");
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
