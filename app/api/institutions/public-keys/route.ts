import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toErrorResponse } from "@/lib/errors";

/**
 * GET /api/institutions/public-keys (FR-049) — public, anonymous. Lets a
 * client (a future Flutter offline-verification cache, or any third party)
 * fetch every active institution's ECDSA public key ahead of time, so a
 * signed token (lib/crypto/token.ts) can be verified without a network call
 * later. Public keys are not secret — only the matching private keys are
 * (env-only, per CLAUDE.md/Coding Standards rule 2) — so no auth here,
 * mirroring the existing institutions_select_public RLS policy.
 */
export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("institutions")
      .select("id, name, signing_public_key")
      .eq("status", "active")
      .not("signing_public_key", "is", null);
    if (error) throw error;

    return NextResponse.json({
      institutions: (data ?? []).map((row) => ({
        institution_id: row.id,
        name: row.name,
        signing_public_key: row.signing_public_key,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
