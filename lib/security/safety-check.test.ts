import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/url-intelligence", () => ({
  assertPublicHttpUrl: vi.fn(async () => {}),
  followSafeRedirects: vi.fn(async (url: URL) => ({
    chain: [url.toString()],
    finalUrl: url.toString(),
    reachable: true,
    httpsValid: true,
  })),
  analyzeUrlSignals: vi.fn(() => []),
}));

function makeAdmin() {
  const evidenceBuilder: Record<string, unknown> = {
    insert: vi.fn(() => evidenceBuilder),
    select: vi.fn(() => evidenceBuilder),
    single: vi.fn(async () => ({ data: { id: "evidence-1" }, error: null })),
  };
  const checksBuilder: Record<string, unknown> = {
    insert: vi.fn(() => checksBuilder),
    select: vi.fn(() => checksBuilder),
    single: vi.fn(async () => ({ data: { id: "check-1" }, error: null })),
  };
  return {
    from: vi.fn((table: string) => (table === "evidence" ? evidenceBuilder : checksBuilder)),
    _checksBuilder: checksBuilder,
  };
}

describe("runSafetyCheck", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  it("scores pasted text via analyzeContent's rule-based fallback (no API key)", async () => {
    const { runSafetyCheck } = await import("@/lib/security/safety-check");
    const admin = makeAdmin();

    const result = await runSafetyCheck(admin as never, {
      inputType: "text",
      text: "URGENT: send money now via mobile money or lose your scholarship!",
      userId: null,
    });

    expect(result.input_type).toBe("text");
    expect(result.risk_level).not.toBe("low");
    expect(result.analysis?.source).toBe("local_model");
    expect(admin._checksBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ input_type: "text", user_id: null })
    );
  });

  it("flags a PDF containing embedded JavaScript as high risk", async () => {
    const { runSafetyCheck } = await import("@/lib/security/safety-check");
    const admin = makeAdmin();
    const maliciousPdf = Buffer.from("%PDF-1.4\n/JavaScript (app.alert('x'))\n%%EOF");

    const result = await runSafetyCheck(admin as never, {
      inputType: "file",
      fileBuffer: maliciousPdf,
      fileName: "certificate.pdf",
      mimeType: "application/pdf",
      userId: "user-1",
    });

    expect(result.risk_score).toBeGreaterThanOrEqual(45);
    expect(result.findings.some((f) => "explanation" in f && f.explanation.includes("JavaScript"))).toBe(
      true
    );
  });

  it("flags a file whose extension doesn't match its sniffed content type", async () => {
    const { runSafetyCheck } = await import("@/lib/security/safety-check");
    const admin = makeAdmin();

    const result = await runSafetyCheck(admin as never, {
      inputType: "file",
      fileBuffer: Buffer.from("not really a pdf"),
      fileName: "totally-safe.pdf",
      mimeType: "image/png",
      userId: null,
    });

    expect(result.findings.some((f) => "explanation" in f && f.explanation.includes("does not match"))).toBe(
      true
    );
  });

  it("combines deterministic URL signals with the AI fallback for a link check", async () => {
    const { runSafetyCheck } = await import("@/lib/security/safety-check");
    const admin = makeAdmin();

    const result = await runSafetyCheck(admin as never, {
      inputType: "link",
      url: "https://example.com/login",
      userId: null,
    });

    expect(result.input_type).toBe("link");
    expect(typeof result.risk_score).toBe("number");
  });
});
