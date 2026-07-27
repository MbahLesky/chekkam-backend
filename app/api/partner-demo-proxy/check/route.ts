import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { ConfigError, ValidationError, toErrorResponse } from "@/lib/errors";
import { parseBody } from "@/lib/validation/parse";
import { getSelfOrigin } from "@/lib/self-origin";

const bodySchema = z.object({ content: z.string().min(1) });
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * POST /api/partner-demo-proxy/check — server-side proxy for the
 * `/partner-demo` app (FR-092). This is the "server-side key proxy" the
 * spec calls for: the browser never sees `PARTNER_DEMO_API_KEY`. It calls
 * the REAL public `/v1/partner/check` endpoint over HTTP with that key,
 * the same way an actual partner's backend would — not a shortcut through
 * internal functions — so this proves the real partner API contract, not
 * just that analyzeContent() works.
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

    const body = parseBody(bodySchema, await req.json());
    const base = getSelfOrigin(req);

    // The route lives at app/api/v1/partner/check/route.ts, which Next.js's
    // App Router resolves to /api/v1/partner/check — despite this route's
    // own doc comment (and the SRS) calling it "/v1/partner/check" without
    // the /api prefix. Confirmed by testing both paths directly: only the
    // /api/-prefixed one exists.
    const upstream = await fetch(`${base}/api/v1/partner/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ content: body.content }),
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
