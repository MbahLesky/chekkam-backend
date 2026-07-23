import { describe, expect, it, vi, beforeEach } from "vitest";
import { ruleBasedFallback } from "@/lib/ai/risk-analysis";

const logAiPrediction = vi.fn(async () => {});
vi.mock("@/lib/ai/predictions", () => ({
  logAiPrediction: (...args: unknown[]) => logAiPrediction(...args),
}));

describe("ruleBasedFallback", () => {
  it("flags urgency + payment language as high risk, low confidence", () => {
    const result = ruleBasedFallback(
      "URGENT: send money now via mobile money or lose your scholarship, act now!"
    );
    expect(result.risk_level).toBe("high");
    expect(result.category).toBe("mobile_money_fraud");
    expect(result.confidence).toBe("low");
    expect(result.needs_human_review).toBe(true);
    expect(result.source).toBe("rule_based_fallback");
    expect(result.indicators.has_urgency_pressure).toBe(true);
    expect(result.indicators.requests_payment).toBe(true);
  });

  it("flags a bare link with no other signals as low/medium risk phishing", () => {
    const result = ruleBasedFallback("Check this out: https://example.com/win");
    expect(result.indicators.contains_suspicious_link).toBe(true);
    expect(result.category).toBe("phishing");
    expect(result.risk_level).toBe("medium");
  });

  it("returns low risk with a pending-review reason for benign text", () => {
    const result = ruleBasedFallback("Hello, how are you today?");
    expect(result.risk_level).toBe("low");
    expect(result.reasons[0]).toMatch(/not been reviewed/i);
  });
});

describe("analyzeContent (no OPENAI_API_KEY)", () => {
  beforeEach(() => {
    logAiPrediction.mockClear();
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  it("falls back to rule-based analysis and logs the prediction", async () => {
    const { analyzeContent } = await import("@/lib/ai/risk-analysis");
    const result = await analyzeContent("send money now, urgent!", {
      reportId: "report-123",
      inputType: "text",
    });

    expect(result.source).toBe("rule_based_fallback");
    expect(logAiPrediction).toHaveBeenCalledTimes(1);
    const call = logAiPrediction.mock.calls[0][0] as Record<string, unknown>;
    expect(call.reportId).toBe("report-123");
    expect(call.inputType).toBe("text");
    expect(call.source).toBe("rule_based_fallback");
    expect(typeof call.latencyMs).toBe("number");
  });
});
