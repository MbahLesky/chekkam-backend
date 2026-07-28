import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole, requireInstitutionMember } from "@/lib/auth";
import { productRegisterSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { AuthError, toErrorResponse } from "@/lib/errors";
import { registerProductCore } from "@/lib/products/register";

/**
 * POST /api/products — manufacturer officer registers a new product
 * (Phase 10). Plain JSON body, no file — mirrors app/api/documents/sign's
 * auth/scoping/institution-active-check pattern.
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);

    const body = parseBody(productRegisterSchema, await req.json());
    await requireInstitutionMember(profile, body.institution_id);

    const admin = getSupabaseAdmin();

    const { data: institution, error: institutionError } = await admin
      .from("institutions")
      .select("status")
      .eq("id", body.institution_id)
      .single();
    if (institutionError) throw institutionError;
    if (institution.status !== "active") {
      throw new AuthError(
        "This manufacturer has not been activated for registering products yet. An admin must provision its signing key first.",
        403
      );
    }

    const result = await registerProductCore(admin, {
      institutionId: body.institution_id,
      productName: body.product_name,
      category: body.category,
      batchNumber: body.batch_number,
      manufacturedAt: body.manufactured_at,
      expiryDate: body.expiry_date,
      actorId: profile.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * GET /api/products — list products for the dashboard. Institution officers
 * see only their own institution's products; analysts/admins see everything.
 * Mirrors app/api/documents/route.ts exactly.
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "analyst", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    let query = admin
      .from("products")
      .select(
        "id, institution_id, product_code, product_name, category, batch_number, manufactured_at, expiry_date, product_hash, signature, qr_payload, status, status_reason, status_changed_at, created_at, institutions(name)"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (profile.role === "institution_officer") {
      const { data: memberships } = await admin
        .from("institution_members")
        .select("institution_id")
        .eq("user_id", profile.id);

      const institutionIds = (memberships ?? []).map((m) => m.institution_id);
      if (institutionIds.length === 0) {
        return NextResponse.json({ products: [] });
      }
      query = query.in("institution_id", institutionIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const products = (data ?? []).map((product) => {
      const institution = Array.isArray(product.institutions) ? product.institutions[0] : product.institutions;
      return {
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
      };
    });

    return NextResponse.json({ products });
  } catch (err) {
    return toErrorResponse(err);
  }
}
