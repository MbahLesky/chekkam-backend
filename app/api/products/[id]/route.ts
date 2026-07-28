import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole, requireInstitutionMember } from "@/lib/auth";
import { productStatusUpdateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { AuthError, toErrorResponse, jsonError } from "@/lib/errors";

/**
 * GET /api/products/:id — single-product detail for the dashboard, same
 * shape/scoping as GET /api/products. Mirrors app/api/documents/[id]/route.ts.
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
    const { data: product, error } = await admin
      .from("products")
      .select(
        "id, institution_id, product_code, product_name, category, batch_number, manufactured_at, expiry_date, product_hash, signature, qr_payload, status, status_reason, status_changed_at, created_at, institutions(name)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!product) return jsonError("NOT_FOUND", "Product not found.", 404);

    if (profile.role === "institution_officer") {
      await requireInstitutionMember(profile, product.institution_id);
    }

    const institution = Array.isArray(product.institutions) ? product.institutions[0] : product.institutions;
    return NextResponse.json({
      id: product.id,
      institution_id: product.institution_id,
      institution_name: institution?.name ?? null,
      product_code: product.product_code,
      product_name: product.product_name,
      category: product.category,
      batch_number: product.batch_number,
      manufactured_at: product.manufactured_at,
      expiry_date: product.expiry_date,
      product_hash: product.product_hash,
      signature: product.signature,
      qr_payload: product.qr_payload,
      status: product.status,
      status_reason: product.status_reason,
      status_changed_at: product.status_changed_at,
      created_at: product.created_at,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/products/:id — lifecycle transition (recall / mark_stolen /
 * reactivate). One route with an action discriminator for three symmetric
 * transitions, following this codebase's single-PATCH-with-discriminator
 * precedent (see campaignUpdateSchema) rather than tripling the auth/scoping
 * boilerplate the way documents' separate revoke/restore routes do.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const body = parseBody(productStatusUpdateSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data: product } = await admin
      .from("products")
      .select("id, institution_id, status")
      .eq("id", id)
      .maybeSingle();

    if (!product) {
      return jsonError("NOT_FOUND", "Product not found.", 404);
    }

    if (profile.role === "institution_officer") {
      const { data: membership } = await admin
        .from("institution_members")
        .select("id")
        .eq("institution_id", product.institution_id)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (!membership) {
        throw new AuthError("You are not a member of this product's institution.", 403);
      }
    }

    const newStatus =
      body.action === "recall" ? "recalled" : body.action === "mark_stolen" ? "stolen" : "active";

    const { data: updated, error } = await admin
      .from("products")
      .update({
        status: newStatus,
        status_reason: body.action === "reactivate" ? null : body.reason,
        status_changed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, status, status_reason, status_changed_at")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: `product.${body.action}`,
      target_table: "products",
      target_id: id,
      metadata: { reason: body.reason ?? null },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
