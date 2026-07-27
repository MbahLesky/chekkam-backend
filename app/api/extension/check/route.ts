import { NextRequest } from "next/server";
import { handleFreeContentCheck } from "@/lib/channels/free-check";

/**
 * POST /api/extension/check — free citizen-tier check for the browser
 * extension (Phase 2 spec P2-30). No API key; rate-limited by IP instead.
 * Reuses analyzeContent() — the same engine as every other channel.
 * CORS (including OPTIONS preflight) is handled globally by proxy.ts.
 */
export async function POST(req: NextRequest) {
  return handleFreeContentCheck(req, { channel: "extension", rateLimitPrefix: "extension" });
}
