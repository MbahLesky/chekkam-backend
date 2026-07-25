import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, resolveOptionalUserId } from "@/lib/auth";
import { reportCreateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";
import { analyzeContent } from "@/lib/ai/risk-analysis";
import { extractFingerprint } from "@/lib/campaigns/fingerprint";
import {
  matchCampaign,
  findMatchingUnlinkedReport,
  attachToCampaign,
  createCampaignFromReports,
} from "@/lib/campaigns/matcher";

/**
 * POST /api/reports — submit suspicious content (SRS FR-010, 6.1).
 * Text/link content is analyzed synchronously (AI risk analysis + campaign
 * matching, SRS Section 8-9) before responding; image/file content is queued
 * for analyst review since OCR-based analysis is Phase 2 (FR-048).
 */
export async function POST(req: NextRequest) {
  try {
    const body = parseBody(reportCreateSchema, await req.json());
    const reporterId = await resolveOptionalUserId(req);
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

    // Links a prior POST /api/ocr/upload result to this report for audit
    // traceability (evidence.report_id, unset by default). Best-effort: an
    // unknown/foreign evidence_id is simply a no-op, never a failed report.
    if (body.evidence_id) {
      await admin.from("evidence").update({ report_id: reportId }).eq("id", body.evidence_id);
    }

    if (body.content_type === "text" || body.content_type === "link") {
      const analysis = await analyzeContent(body.raw_content ?? "", {
        reportId,
        inputType: body.content_type,
      });
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
            ? "Report analyzed. See GET /api/reports/:id for the full result."
            : "Report received. Analyzing...",
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * GET /api/reports — filterable list. Staff (analyst/admin/super_admin) get
 * the full dashboard list (FR-081); everyone else is scoped to their own
 * submitted reports ("my reports" history) regardless of other filters —
 * this endpoint requires a session either way.
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    const admin = getSupabaseAdmin();
    const { searchParams } = req.nextUrl;
    const isStaff = ["analyst", "admin", "super_admin"].includes(profile.role);

    let query = admin
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!isStaff) {
      query = query.eq("reporter_id", profile.id);
    }

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
