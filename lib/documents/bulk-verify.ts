import { SupabaseClient } from "@supabase/supabase-js";
import { verifyByIdOrPin, VerifyResult } from "@/lib/documents/verify";
import { ValidationError } from "@/lib/errors";

/** Hard cap on rows per job — keeps this synchronous slice safe against abuse/huge uploads. */
export const MAX_BULK_ROWS = 500;

export type BulkVerifyRow = {
  row: number;
  verification_id_attempted: string;
} & VerifyResult;

/** Splits a CSV/plain-text upload into one verification ID/PIN per non-empty line, ignoring a header row if present. */
export function parseVerificationIdList(csvText: string): string[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim())
    .filter((line): line is string => !!line);

  const withoutHeader =
    lines[0] && /^(verification[_ ]?id|id|pin)$/i.test(lines[0]) ? lines.slice(1) : lines;

  if (withoutHeader.length === 0) {
    throw new ValidationError("The uploaded file contained no verification IDs.", "file");
  }
  if (withoutHeader.length > MAX_BULK_ROWS) {
    throw new ValidationError(
      `A single bulk job is limited to ${MAX_BULK_ROWS} rows (got ${withoutHeader.length}). Split into smaller batches.`,
      "file"
    );
  }
  return withoutHeader;
}

/**
 * Runs Registry Verification (lib/documents/verify.ts — the same engine every
 * other surface uses, never a second implementation) over each row in turn.
 * Synchronous by design for this row cap; the job record still gives callers
 * a stable id to reference and an auditable, timestamped snapshot of results.
 */
export async function runBulkVerification(
  admin: SupabaseClient,
  verificationIds: string[]
): Promise<BulkVerifyRow[]> {
  const results: BulkVerifyRow[] = [];
  for (let i = 0; i < verificationIds.length; i++) {
    const attempted = verificationIds[i];
    const result = await verifyByIdOrPin(admin, attempted, "api");
    results.push({ row: i + 1, verification_id_attempted: attempted, ...result });
  }
  return results;
}
