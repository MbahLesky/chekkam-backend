import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { institutionStatusUpdateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse, jsonError } from "@/lib/errors";

/**
 * GET /api/institutions/:id — public detail lookup (Phase 11 — Cameroon
 * Trusted Institution Registry / National Verification Directory: a citizen
 * who found an institution via GET /api/institutions taps through to confirm
 * its contact details before trusting a document/message). Only ever
 * resolves `status=active` rows and the same safe field set the list
 * endpoint already exposes, plus verified_domains/contact fields — nothing
 * that isn't already public knowledge for an active institution.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("institutions")
      .select("id, name, type, verified, verified_domains, contact_email, contact_phone, status, created_at")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "Institution not found.", 404);
    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/institutions/:id — admin activates a pending institution (so it
 * can sign documents, see app/api/documents/sign/route.ts's activation
 * check) or suspends an active one. Admin-only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);

    const body = parseBody(institutionStatusUpdateSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("institutions")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, status")
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError("NOT_FOUND", "Institution not found.", 404);

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "institution.status_update",
      target_table: "institutions",
      target_id: id,
      metadata: { new_status: body.status },
    });

    return NextResponse.json(data);
  } catch (err) {
    return toErrorResponse(err);
  }
}
