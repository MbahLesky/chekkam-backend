import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKey, logApiUsage } from "@/lib/partner-auth";
import { analyzeContent } from "@/lib/ai/risk-analysis";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";
import { pickLang } from "@/lib/i18n";

const partnerCheckSchema = z.object({
  content: z.string().min(1),
  language: z.enum(["en", "fr"]).optional(),
});

/**
 * POST /v1/partner/check — server-to-server text/link risk check for API
 * partners (FR-061). Auth via X-Api-Key header, not a Supabase session.
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  let apiKeyId: string | undefined;
  const requestLang = pickLang(req.headers.get("accept-language"));
  try {
    const apiKey = await requireApiKey(req);
    apiKeyId = apiKey.id;

    const body = parseBody(partnerCheckSchema, await req.json());
    const analysis = await analyzeContent(
      body.content,
      pickLang(body.language, requestLang)
    );

    const response = NextResponse.json({
      risk_level: analysis.risk_level,
      risk_score: analysis.risk_score,
      category: analysis.category,
      recommended_action: analysis.recommended_action,
      needs_human_review: true,
    });
    await logApiUsage(apiKeyId, "/v1/partner/check", 200, Date.now() - start);
    return response;
  } catch (err) {
    const res = toErrorResponse(err, requestLang);
    if (apiKeyId) {
      await logApiUsage(apiKeyId, "/v1/partner/check", res.status, Date.now() - start);
    }
    return res;
  }
}
