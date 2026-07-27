import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { ConfigError, ValidationError, toErrorResponse } from "@/lib/errors";

const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * POST /api/partner-demo-proxy/document-check — server-side proxy for
 * `/partner-demo` (FR-092), mirroring check/route.ts: calls the real public
 * `/v1/partner/document-check` over HTTP with `PARTNER_DEMO_API_KEY`, which
 * never reaches the browser.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`partner-demo:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many demo requests. Try again shortly." } },
        { status: 429 }
      );
    }

    const apiKey = process.env.PARTNER_DEMO_API_KEY;
    if (!apiKey) {
      throw new ConfigError(
        "PARTNER_DEMO_API_KEY is not set. This demo needs its own partner API key — see .env.example."
      );
    }

    const incomingForm = await req.formData();
    const file = incomingForm.get("file");
    const verificationId = incomingForm.get("verification_id");
    if (!(file instanceof File) && typeof verificationId !== "string") {
      throw new ValidationError("Provide a file and/or verification_id.", "file");
    }

    const outgoingForm = new FormData();
    if (file instanceof File) outgoingForm.set("file", file);
    if (typeof verificationId === "string" && verificationId.length > 0) {
      outgoingForm.set("verification_id", verificationId);
    }

    // Deliberately NOT process.env.APP_BASE_URL — see check/route.ts's comment.
    const base = req.nextUrl.origin;
    // See check/route.ts's comment: the real path is /api/v1/partner/..., not /v1/partner/...
    const upstream = await fetch(`${base}/api/v1/partner/document-check`, {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: outgoingForm,
    });
    const upstreamBody = await upstream.json();
    if (!upstream.ok) {
      throw new ValidationError(upstreamBody?.error?.message ?? "The partner API rejected this request.");
    }

    return NextResponse.json(upstreamBody, { status: upstream.status });
  } catch (err) {
    return toErrorResponse(err);
  }
}
