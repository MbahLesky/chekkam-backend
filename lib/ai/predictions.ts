import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type LogAiPredictionInput = {
  reportId?: string | null;
  source: "ai" | "local_model" | "rule_based_fallback";
  model?: string | null;
  inputType?: "text" | "link";
  latencyMs: number;
  riskLevel?: string | null;
  riskScore?: number | null;
  category?: string | null;
  confidence?: string | null;
  error?: string | null;
};

/**
 * Best-effort audit log of every AI analysis call (model, latency, outcome).
 * Never throws — logging must never break the citizen-facing analysis path,
 * same graceful-degradation rule as analyzeContent() itself.
 */
export async function logAiPrediction(input: LogAiPredictionInput): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from("ai_predictions").insert({
      report_id: input.reportId ?? null,
      source: input.source,
      model: input.model ?? null,
      input_type: input.inputType ?? "text",
      latency_ms: input.latencyMs,
      risk_level: input.riskLevel ?? null,
      risk_score: input.riskScore ?? null,
      category: input.category ?? null,
      confidence: input.confidence ?? null,
      error: input.error ?? null,
    });
  } catch (err) {
    console.error("[ai/predictions] failed to log prediction:", err);
  }
}
