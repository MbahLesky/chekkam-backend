import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { verifyByUpload, VerifierChannel } from "@/lib/documents/verify";

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * POST /api/documents/verify-upload — verify by uploaded file, optionally
 * scoped to a known verification_id/PIN. SRS 6.4, 10.2.
 * Public/unauthenticated by design — rate-limited by IP instead.
 *
 * multipart/form-data fields: file (required), verification_id (optional).
 * Thin wrapper over lib/documents/verify.ts — the shared logic also used by
 * the WhatsApp/Telegram bots, so there is exactly one verification path.
 */
export async function POST(req: NextRequest) {
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

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file is required (multipart/form-data).", "file");
    }
    const verificationIdField = form.get("verification_id");
    const channel = (form.get("channel") as VerifierChannel) || "web";

    const buffer = Buffer.from(await file.arrayBuffer());
    const admin = getSupabaseAdmin();
    const result = await verifyByUpload(
      admin,
      buffer,
      typeof verificationIdField === "string" ? verificationIdField : null,
      channel
    );
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
