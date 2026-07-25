import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole, requireInstitutionMember } from "@/lib/auth";
import { documentSignSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { AuthError, ValidationError, toErrorResponse } from "@/lib/errors";
import { signDocumentCore } from "@/lib/documents/sign-document";

/**
 * POST /api/documents/sign — institution officer signs a document.
 * SRS 6.4, 10.1. Requires multipart/form-data with fields:
 * file, institution_id, document_type, recipient_name?
 *
 * Thin wrapper over lib/documents/sign-document.ts — the shared logic also
 * used by the WhatsApp/Telegram `SIGN` flow, so there is exactly one signing path.
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file is required (multipart/form-data).", "file");
    }

    const parsed = parseBody(documentSignSchema, {
      institution_id: form.get("institution_id"),
      document_type: form.get("document_type"),
      recipient_name: form.get("recipient_name") || undefined,
      expiry_date: form.get("expiry_date") || undefined,
    });

    await requireInstitutionMember(profile, parsed.institution_id);

    const admin = getSupabaseAdmin();

    // Signup security rule: a self-registered institution starts 'pending' and
    // cannot sign until an admin activates it (and provisions its signing key).
    const { data: institution, error: institutionError } = await admin
      .from("institutions")
      .select("status")
      .eq("id", parsed.institution_id)
      .single();
    if (institutionError) throw institutionError;
    if (institution.status !== "active") {
      throw new AuthError(
        "This institution has not been activated for signing yet. An admin must provision its signing key first.",
        403
      );
    }

    const result = await signDocumentCore(admin, {
      institutionId: parsed.institution_id,
      documentType: parsed.document_type,
      recipientName: parsed.recipient_name,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      actorId: profile.id,
      expiryDate: parsed.expiry_date ?? null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
