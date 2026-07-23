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

/** Returns the profile for an institution_officer if they belong to `institutionId`. */
export async function requireInstitutionMember(
  profile: AuthedProfile,
  institutionId: string
) {
  if (profile.role === "admin" || profile.role === "super_admin") return;
  const admin = getSupabaseAdmin();
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
