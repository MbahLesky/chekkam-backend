import { SupabaseClient } from "@supabase/supabase-js";
import { bearerTokenFrom } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { AuthError } from "@/lib/errors";

export type Role =
  | "citizen"
  | "analyst"
  | "institution_officer"
  | "admin"
  | "super_admin";

export type AuthedProfile = { id: string; role: Role };

/**
 * Resolves the caller's user ID if a valid session is present, or null for
 * anonymous callers — for endpoints that allow anonymous submission (reports,
 * OCR uploads) but still attribute the record to a session when one exists.
 */
export async function resolveOptionalUserId(req: Request): Promise<string | null> {
  const token = bearerTokenFrom(req);
  if (!token) return null;
  const admin = getSupabaseAdmin();
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

/** Verifies the request's bearer token against Supabase Auth and loads its profile/role. */
export async function requireUser(req: Request): Promise<AuthedProfile> {
  const token = bearerTokenFrom(req);
  if (!token) throw new AuthError("Missing Authorization bearer token.", 401);

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new AuthError("Invalid or expired session.", 401);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    throw new AuthError("No profile found for this user.", 401);
  }
  return profile as AuthedProfile;
}

/** Throws a 403 AuthError unless the profile's role is one of `roles`. */
export function requireRole(profile: AuthedProfile, roles: Role[]) {
  if (!roles.includes(profile.role)) {
    throw new AuthError(`This action requires one of: ${roles.join(", ")}.`, 403);
  }
}

/**
 * Throws unless `profile` is an admin/super_admin or an institution_officer
 * belonging to `institutionId`. Accepts an optional Supabase client (defaults
 * to the real admin client) so callers/tests can inject a fake one.
 */
export async function requireInstitutionMember(
  profile: AuthedProfile,
  institutionId: string,
  client?: SupabaseClient
) {
  if (profile.role === "admin" || profile.role === "super_admin") return;
  const admin = client ?? getSupabaseAdmin();
  const { data } = await admin
    .from("institution_members")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!data) {
    throw new AuthError("You are not a member of this institution.", 403);
  }
}

/**
 * Throws unless `profile` is analyst/admin/super_admin, or an
 * institution_officer belonging to a verified, active institution (Phase 11
 * — Cameroon Emergency Trust Bulletin: "only verified institutional accounts
 * may publish trusted security advisories"). Officers of a pending/unverified
 * institution are deliberately excluded — membership alone isn't enough.
 */
export async function requireAlertPublisher(
  profile: AuthedProfile,
  client?: SupabaseClient
) {
  if (["analyst", "admin", "super_admin"].includes(profile.role)) return;
  if (profile.role === "institution_officer") {
    const admin = client ?? getSupabaseAdmin();
    const { data: memberships } = await admin
      .from("institution_members")
      .select("institution_id")
      .eq("user_id", profile.id);
    const institutionIds = (memberships ?? []).map((m) => m.institution_id as string);
    if (institutionIds.length > 0) {
      const { data: verified } = await admin
        .from("institutions")
        .select("id")
        .in("id", institutionIds)
        .eq("verified", true)
        .eq("status", "active")
        .limit(1);
      if (verified && verified.length > 0) return;
    }
  }
  throw new AuthError(
    "This action requires analyst/admin, or an officer of a verified, active institution.",
    403
  );
}
