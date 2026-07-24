import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { bearerTokenFrom } from "@/lib/supabase/client";
import { reportCreateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";
import { analyzeContent } from "@/lib/ai/risk-analysis";
import { pickLang, tt } from "@/lib/i18n";
import { extractFingerprint } from "@/lib/campaigns/fingerprint";
import {
  matchCampaign,
  findMatchingUnlinkedReport,
  attachToCampaign,
  createCampaignFromReports,
} from "@/lib/campaigns/matcher";

/** Anonymous submission is allowed (FR-005); resolves reporter_id only if a session token is present. */
async function resolveReporterId(req: NextRequest): Promise<string | null> {
  const token = bearerTokenFrom(req);
  if (!token) return null;
  const admin = getSupabaseAdmin();
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

/**
 * POST /api/reports — submit suspicious content (SRS FR-010, 6.1).
 * Text/link content is analyzed synchronously (AI risk analysis + campaign
 * matching, SRS Section 8-9) before responding; image/file content is queued
 * for analyst review since OCR-based analysis is Phase 2 (FR-048).
 */
export async function POST(req: NextRequest) {
  let preferredLang = pickLang(req.headers.get("accept-language"));
  try {
    const body = parseBody(reportCreateSchema, await req.json());
    preferredLang = pickLang(
      body.language === "unknown" ? null : body.language,
      req.headers.get("accept-language")
    );
    const reporterId = await resolveReporterId(req);
    const admin = getSupabaseAdmin();

    const location =
      body.lat !== undefined && body.lng !== undefined
        ? `SRID=4326;POINT(${body.lng} ${body.lat})`
        : null;

    const { data: inserted, error: insertError } = await admin
      .from("reports")
      .insert({
        reporter_id: reporterId,
        channel: body.channel,
        content_type: body.content_type,
        raw_content: body.raw_content ?? null,
        file_url: body.file_url ?? null,
        language: body.language,
        location,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;
    const reportId = inserted.id as string;
    let finalStatus: string = "pending";

    if (body.content_type === "text" || body.content_type === "link") {
      const analysis = await analyzeContent(body.raw_content ?? "", preferredLang);
      const fingerprint = extractFingerprint(body.raw_content ?? "");

      let campaignId = await matchCampaign(admin, fingerprint);
      if (campaignId) {
        await attachToCampaign(admin, campaignId, reportId);
      } else {
        const matchingReportId = await findMatchingUnlinkedReport(admin, fingerprint, reportId);
        if (matchingReportId) {
          campaignId = await createCampaignFromReports(
            admin,
            [matchingReportId, reportId],
            fingerprint,
            analysis.category,
            analysis.risk_level
          );
        }
      }

      await admin
        .from("reports")
        .update({
          status: "analyzed",
          risk_level: analysis.risk_level,
          risk_score: analysis.risk_score,
          category: analysis.category,
          ai_reasons: analysis.reasons,
          ai_indicators: { ...analysis.indicators, fingerprint, source: analysis.source },
          recommended_action: analysis.recommended_action,
          needs_human_review: true,
          confidence: analysis.confidence,
          language: analysis.language === "unknown" ? body.language : analysis.language,
        })
        .eq("id", reportId);

      finalStatus = "analyzed";
    }

    return NextResponse.json(
      {
        id: reportId,
        status: finalStatus,
        message:
          finalStatus === "analyzed"
            ? tt("reportAnalyzed", preferredLang)
            : tt("reportReceived", preferredLang),
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err, preferredLang);
  }
}

/** GET /api/reports — filterable list for the analyst web dashboard (FR-081). */
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const { searchParams } = req.nextUrl;

    let query = admin
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    const status = searchParams.get("status");
    const riskLevel = searchParams.get("risk_level");
    const category = searchParams.get("category");
    const channel = searchParams.get("channel");
    if (status) query = query.eq("status", status);
    if (riskLevel) query = query.eq("risk_level", riskLevel);
    if (category) query = query.eq("category", category);
    if (channel) query = query.eq("channel", channel);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ reports: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
