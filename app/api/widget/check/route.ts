import { NextRequest } from "next/server";
import { handleFreeContentCheck } from "@/lib/channels/free-check";

/**
 * POST /api/widget/check — free citizen-tier check for the embeddable
 * website widget (Task B, "Verify everywhere"). No API key; rate-limited by
 * IP. Reuses the exact same analyzeContent() engine and free-check pipeline
 * as the browser extension, only the channel attribution differs.
 */
export async function POST(req: NextRequest) {
  return handleFreeContentCheck(req, { channel: "widget", rateLimitPrefix: "widget" });
}
