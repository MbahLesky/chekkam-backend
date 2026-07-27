import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { analyzeContent } from "@/lib/ai/risk-analysis";
import { extractFingerprint } from "@/lib/campaigns/fingerprint";
import {
  matchCampaign,
  findMatchingUnlinkedReport,
  attachToCampaign,
  createCampaignFromReports,
} from "@/lib/campaigns/matcher";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";
import { pickLang, tt } from "@/lib/i18n";

const extensionCheckSchema = z.object({
  content: z.string().min(1).max(5000),
  type: z.enum(["text", "link", "page"]),
  language: z.enum(["en", "fr"]).optional(),
});

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * POST /api/extension/check — free citizen-tier check for the browser
 * extension (Phase 2 spec P2-30). No API key; rate-limited by IP instead.
 * Reuses analyzeContent() — the same engine as every other channel.
 * CORS (including OPTIONS preflight) is handled globally by proxy.ts.
 */
export async function POST(req: NextRequest) {
  const requestLang = pickLang(req.headers.get("accept-language"));
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const rate = await checkRateLimit(`extension:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: tt("rateLimitedExtension", requestLang),
          },
        },
        { status: 429 }
      );
    }

    const body = parseBody(extensionCheckSchema, await req.json());
    const preferredLang = pickLang(body.language, req.headers.get("accept-language"));
    const analysis = await analyzeContent(body.content, {
      inputType: body.type === "link" ? "link" : "text",
      preferredLanguage: preferredLang,
    });

    // Best-effort persistence: an extension check still returns a result even
    // if Supabase isn't configured yet or the insert fails for any reason.
    try {
      const admin = getSupabaseAdmin();
      const { data: inserted } = await admin
        .from("reports")
        .insert({
          channel: "extension",
          content_type: body.type === "link" ? "link" : "text",
          // Privacy: for type=page, `content` is expected to be the page URL
          // (set by the extension), never the raw page HTML.
          raw_content: body.content,
          status: "analyzed",
          risk_level: analysis.risk_level,
          risk_score: analysis.risk_score,
          category: analysis.category,
          ai_reasons: analysis.reasons,
          ai_indicators: { ...analysis.indicators, source: analysis.source },
          recommended_action: analysis.recommended_action,
          needs_human_review: true,
          confidence: analysis.confidence,
          language: analysis.language === "unknown" ? preferredLang : analysis.language,
        })
        .select("id")
        .single();

      if (inserted) {
        const fingerprint = extractFingerprint(body.content);
        const reportId = inserted.id as string;
        const campaignId = await matchCampaign(admin, fingerprint);
        if (campaignId) {
          await attachToCampaign(admin, campaignId, reportId);
        } else {
          const matchingReportId = await findMatchingUnlinkedReport(admin, fingerprint, reportId);
          if (matchingReportId) {
            await createCampaignFromReports(
              admin,
              [matchingReportId, reportId],
              fingerprint,
              analysis.category,
              analysis.risk_level
            );
          }
        }
      }
    } catch (persistErr) {
      console.warn("[extension/check] report persistence skipped:", persistErr);
    }

    return NextResponse.json({
      risk_level: analysis.risk_level,
      risk_score: analysis.risk_score,
      category: analysis.category,
      reasons: analysis.reasons,
      recommended_action: analysis.recommended_action,
      needs_human_review: true,
      source: analysis.source,
    });
  } catch (err) {
    return toErrorResponse(err, requestLang);
  }
}
