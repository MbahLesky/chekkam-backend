import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { toErrorResponse } from "@/lib/errors";
import { verifyByIdOrPin, VerifierChannel } from "@/lib/documents/verify";

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * GET /api/documents/verify/:verificationId — look up by verification ID or PIN.
 * SRS 6.4, 10.2 steps 1-3 (no file provided, so no hash comparison here).
 * ?channel=mobile|web|api|whatsapp|telegram|extension tags the verification log entry.
 * Public/unauthenticated by design — rate-limited by IP instead.
 *
 * Thin wrapper over lib/documents/verify.ts — the shared logic also used by
 * the WhatsApp/Telegram bots, so there is exactly one verification path.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ verificationId: string }> }
) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`documents-verify:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many verification checks from this network. Please wait a bit and try again.",
          },
        },
        { status: 429 }
      );
    }

    const { verificationId } = await params;
    const channel = (req.nextUrl.searchParams.get("channel") as VerifierChannel) || "web";
    const admin = getSupabaseAdmin();
    const result = await verifyByIdOrPin(admin, verificationId, channel);
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
