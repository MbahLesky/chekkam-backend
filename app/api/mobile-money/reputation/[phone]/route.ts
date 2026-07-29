import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { toErrorResponse } from "@/lib/errors";
import { getNumberReputation } from "@/lib/fraud-intelligence/number-reputation";

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * GET /api/mobile-money/reputation/:phone — Phase 12: "check this number
 * before you pay it." Public and anonymous by design — the whole point is
 * letting a citizen check a number *before* trusting it, which usually means
 * before they'd have any reason to sign in. Rate-limited by IP like every
 * other public lookup endpoint (documents/products verify, institutions).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`mobile-money-reputation:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many number lookups from this network. Please wait a bit and try again.",
          },
        },
        { status: 429 }
      );
    }

    const { phone } = await params;
    const admin = getSupabaseAdmin();
    const result = await getNumberReputation(admin, decodeURIComponent(phone));
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
