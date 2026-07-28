import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { toErrorResponse } from "@/lib/errors";
import { pickLang, tt } from "@/lib/i18n";
import { verifyProductById, ProductVerifierChannel } from "@/lib/products/verify";

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * GET /api/products/verify/:productId — public product-authenticity lookup
 * (Phase 10). ?channel=mobile|web|api tags the verification log entry.
 * Public/unauthenticated by design — rate-limited by IP instead, mirroring
 * app/api/documents/verify/[verificationId]/route.ts exactly.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const preferredLang = pickLang(
    req.nextUrl.searchParams.get("lang"),
    req.headers.get("accept-language")
  );
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`products-verify:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: tt("rateLimitedVerify", preferredLang),
          },
        },
        { status: 429 }
      );
    }

    const { productId } = await params;
    const channel = (req.nextUrl.searchParams.get("channel") as ProductVerifierChannel) || "web";
    const admin = getSupabaseAdmin();
    const result = await verifyProductById(admin, productId, channel);
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err, preferredLang);
  }
}
