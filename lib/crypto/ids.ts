import crypto from "node:crypto";

// Excludes visually-ambiguous characters (0/O, 1/I) per common verification-code practice.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSegment(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Generates an ID like CHK-4F7K-9QRT (SRS 10.1 step 4), RCP-... for a receipt (FR-111), or PRD-... for a product (Phase 10) — same generator, different prefix, so each ID family is visually distinct without a second implementation. */
export function generateVerificationId(prefix: "CHK" | "RCP" | "PRD" = "CHK"): string {
  return `${prefix}-${randomSegment(4)}-${randomSegment(4)}`;
}

/** Generates a random 6-digit PIN, mirroring the WAEC-style PIN model. SRS 10.1 step 4. */
export function generatePinCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}
