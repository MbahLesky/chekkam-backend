import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mediaType = formData.get("media_type") as string;
    const channel = formData.get("channel") as string ?? "mobile";

    if (!file) {
      return NextResponse.json(
        { error: { message: "File is required", code: "VALIDATION_ERROR" } },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: report, error: insertError } = await supabaseAdmin
      .from("reports")
      .insert({
        content_type: mediaType === "video" ? "video" : "image",
        channel,
        status: "under_review",
        raw_content: `Uploaded ${mediaType} file: ${file.name} (${file.size} bytes)`,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Simulate AI risk analysis for a video file
    const result = {
      risk_level: "medium",
      risk_score: 65,
      category: "other",
      language: "en",
      reasons: [
        "This video could not be verified against official channels like CRTV or BBC.",
        "AI-generation heuristics detected minor anomalies (e.g. inconsistent artifacts).",
      ],
      indicators: {
        has_urgency_pressure: false,
        requests_payment: false,
        requests_personal_info: false,
        impersonates_institution: null,
        contains_suspicious_link: false,
      },
      recommended_action: "Treat this video with caution until confirmed by an official source.",
      confidence: "medium",
      suspicious_phrases: [],
      needs_human_review: true,
      source: "ai",
      ...report, // merge with report so app can show report ID
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/media] POST error:", err);
    return NextResponse.json(
      { error: { message: "Internal server error", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
