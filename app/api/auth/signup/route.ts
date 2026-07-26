import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { institutionSignupSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { pickLang, tt } from "@/lib/i18n";

/**
 * POST /api/auth/signup — self-serve institution onboarding.
 *
 * This is an onboarding form only, never a signing capability: the created
 * institution is always `status: 'pending'` and holds no key material. It
 * cannot sign documents until an admin sets status='active' AND provisions
 * DOCUMENT_SIGNING_KEY_<id> in the environment (enforced in
 * app/api/documents/sign/route.ts and lib/crypto/sign.ts respectively) — this
 * keeps channel/signing access "admin-issued only" per Phase 2 spec §1.2,
 * even though registering the record itself is self-serve.
 */
export async function POST(req: NextRequest) {
  const preferredLang = pickLang(req.headers.get("accept-language"));
  try {
    const body = parseBody(institutionSignupSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data: created, error: createUserError } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (createUserError) {
      throw new ValidationError(createUserError.message, "email");
    }
    const userId = created.user.id;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        { id: userId, role: "institution_officer", display_name: body.officer_name },
        { onConflict: "id" }
      );
    if (profileError) throw profileError;

    const { data: institution, error: institutionError } = await admin
      .from("institutions")
      .insert({
        name: body.institution_name,
        type: body.institution_type,
        contact_email: body.email,
        status: "pending",
        verified: false,
      })
      .select("id, name, status")
      .single();
    if (institutionError) throw institutionError;

    const { error: memberError } = await admin.from("institution_members").insert({
      institution_id: institution.id,
      user_id: userId,
      role: "officer",
    });
    if (memberError) throw memberError;

    await admin.from("audit_logs").insert({
      actor_id: userId,
      action: "institution.signup",
      target_table: "institutions",
      target_id: institution.id,
    });

    return NextResponse.json(
      {
        id: institution.id,
        status: institution.status,
        message: tt("signupSuccess", preferredLang),
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, preferredLang);
  }
}
