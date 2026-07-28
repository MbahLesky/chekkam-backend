import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { citizenSignupSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { pickLang, tt } from "@/lib/i18n";

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * POST /api/auth/citizen-signup — self-serve account creation for ordinary
 * citizens (role: 'citizen', hardcoded server-side, never client-controlled).
 * profiles has no public INSERT policy by design (see 0014_rls_hardening.sql —
 * role must never be settable by the client), so account creation always
 * goes through this service-role-backed route, mirroring the existing
 * institution-officer signup at POST /api/auth/signup. Sign-in itself stays
 * client-side (supabase.auth.signInWithPassword), same as the web dashboard's
 * login page — this route only ever runs once, at account creation.
 */
export async function POST(req: NextRequest) {
  const preferredLang = pickLang(req.headers.get("accept-language"));
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`auth-citizen-signup:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many signup attempts from this network. Please wait a bit and try again.",
          },
        },
        { status: 429 }
      );
    }

    const body = parseBody(citizenSignupSchema, await req.json());
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
      .upsert({ id: userId, role: "citizen", display_name: body.display_name }, { onConflict: "id" });
    if (profileError) throw profileError;

    await admin.from("audit_logs").insert({
      actor_id: userId,
      action: "citizen.signup",
      target_table: "profiles",
      target_id: userId,
    });

    return NextResponse.json(
      { id: userId, message: tt("citizenSignupSuccess", preferredLang) },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, preferredLang);
  }
}
