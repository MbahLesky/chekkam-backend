import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { channelIdentityVerifySchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { jsonError, toErrorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * POST /api/channel-identities/verify — confirm the 6-digit code sent to a
 * WhatsApp/Telegram identity (Phase 2 spec P2-02). No session required: the
 * code itself, sent only to that channel, is the proof of possession. Rate
 * limited by IP so the 6-digit code (1,000,000 possibilities) can't be
 * brute-forced.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`channel-identity-verify:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return jsonError("RATE_LIMITED", "Too many attempts from this network. Please wait a bit and try again.", 429);
    }

    const body = parseBody(channelIdentityVerifySchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data: identity } = await admin
      .from("channel_identities")
      .select("id, verify_code, verified")
      .eq("channel", body.channel)
      .eq("external_id", body.external_id)
      .maybeSingle();

    if (!identity) {
      return jsonError("NOT_FOUND", "No pending link request for this channel/identity.", 404);
    }
    if (identity.verified) {
      return NextResponse.json({ verified: true, already_verified: true });
    }
    if (identity.verify_code !== body.code) {
      return jsonError("INVALID_CODE", "That code doesn't match. Double-check and try again.", 400);
    }

    const { error } = await admin
      .from("channel_identities")
      .update({ verified: true, verify_code: null })
      .eq("id", identity.id);
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_type: "user",
      action: "channel_identity.verified",
      target_table: "channel_identities",
      target_id: identity.id,
      metadata: { channel: body.channel },
    });

    return NextResponse.json({ verified: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
