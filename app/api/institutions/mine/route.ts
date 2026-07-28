import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

/**
 * GET /api/institutions/mine
 *
 * Supplies the signing dashboard with real organisations the current officer
 * is allowed to sign for. Replacing a hand-typed UUID is important: a valid
 * signature must always be tied to the intended issuing organisation.
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["institution_officer", "admin", "super_admin"]);
    const admin = getSupabaseAdmin();

    if (profile.role === "admin" || profile.role === "super_admin") {
      const { data, error } = await admin
        .from("institutions")
        .select("id, name, type, verified, status")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return NextResponse.json({ institutions: data ?? [] });
    }

    const { data, error } = await admin
      .from("institution_members")
      .select("role, institutions(id, name, type, verified, status)")
      .eq("user_id", profile.id);
    if (error) throw error;

    const institutions = (data ?? [])
      .map((membership) => {
        const institution = Array.isArray(membership.institutions)
          ? membership.institutions[0]
          : membership.institutions;
        return institution ? { ...institution, member_role: membership.role } : null;
      })
      .filter((institution) => institution?.status === "active");

    return NextResponse.json({ institutions });
  } catch (err) {
    return toErrorResponse(err);
  }
}
