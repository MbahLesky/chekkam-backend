import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { isReceiptSignatureValid, VerificationReceipt } from "@/lib/documents/receipt";

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * GET /api/verification-receipts/verify/:receiptId — public, anonymous
 * (mirrors GET /api/documents/verify/:verificationId's access model): confirms
 * a receipt is a genuine, unaltered Chekkam artifact by re-deriving Chekkam's
 * public key and checking the stored ECDSA signature, never trusting the row
 * at face value.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`verification-receipts-verify:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests from this network. Please wait a bit and try again." } },
        { status: 429 }
      );
    }

    const { receiptId } = await params;
    const admin = getSupabaseAdmin();
    const { data: receipt } = await admin
      .from("verification_receipts")
      .select("id, document_id, file_hash, result, verified_by_org, receipt_signature, receipt_verification_id, created_at")
      .eq("receipt_verification_id", receiptId)
      .maybeSingle<VerificationReceipt>();

    if (!receipt) {
      return NextResponse.json({ status: "not_found", receipt_verification_id: receiptId });
    }

    const valid = isReceiptSignatureValid(receipt);
    return NextResponse.json({
      status: valid ? "genuine" : "tampered",
      receipt_verification_id: receipt.receipt_verification_id,
      result: receipt.result,
      verified_by_org: receipt.verified_by_org,
      file_hash: receipt.file_hash,
      created_at: receipt.created_at,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
