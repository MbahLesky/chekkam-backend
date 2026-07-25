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
