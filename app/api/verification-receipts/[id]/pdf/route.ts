import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { generateReceiptPdf, VerificationReceipt } from "@/lib/documents/receipt";

/**
 * GET /api/verification-receipts/:id/pdf (FR-111) — downloads the signed
 * receipt PDF. Same auth scope as creating one (session staff only here —
 * partners get the JSON from the POST response, which already has
 * everything needed; a printable PDF is a staff/dashboard convenience).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "analyst", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const { data: receipt } = await admin
      .from("verification_receipts")
      .select("id, document_id, file_hash, result, verified_by_org, receipt_signature, receipt_verification_id, created_at")
      .eq("id", id)
      .maybeSingle<VerificationReceipt>();

    if (!receipt) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Receipt not found." } },
        { status: 404 }
      );
    }

    const pdfBytes = await generateReceiptPdf(receipt);
    return new Response(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Chekkam-Receipt-${receipt.receipt_verification_id}.pdf"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
