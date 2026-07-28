import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  analyzeTextAuthenticity,
  analyzeImageAuthenticity,
  analyzeDocumentAuthenticity,
  videoAuthenticityStatus,
  audioAuthenticityStatus,
} from "@/lib/ai/content-authenticity";

vi.mock("jimp", () => ({
  Jimp: { read: vi.fn(async () => ({})) },
}));

vi.mock("@/lib/ai/ocr", () => ({
  extractText: vi.fn(async () => ({ status: "unavailable", processingTimeMs: 1 })),
}));

describe("content authenticity — no OPENAI_API_KEY", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  it("text: returns unavailable rather than fabricating a result", async () => {
    const result = await analyzeTextAuthenticity("Some text to check.");
    expect(result.status).toBe("unavailable");
    expect(result.confidence).toBeNull();
  });

  it("image: returns unavailable", async () => {
    const result = await analyzeImageAuthenticity(Buffer.from("fake-image"), "image/png");
    expect(result.status).toBe("unavailable");
  });

  it("document: returns unavailable when OCR itself is unavailable", async () => {
    const result = await analyzeDocumentAuthenticity(Buffer.from("fake-pdf"), "application/pdf");
    expect(result.status).toBe("unavailable");
  });
});

describe("video/audio — always not_supported", () => {
  it("video returns not_supported without any processing", () => {
    expect(videoAuthenticityStatus().status).toBe("not_supported");
  });

  it("audio returns not_supported without any processing", () => {
    expect(audioAuthenticityStatus().status).toBe("not_supported");
  });
});

describe("confidence is never reported as high", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("clamps a model-reported 'high' confidence down to 'medium'", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ai_likelihood: "high",
                confidence: "high",
                indicators: { flag: true },
                explanation: ["Looks AI-generated."],
              }),
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const result = await analyzeTextAuthenticity("Some text that looks AI-written.");
    expect(result.status).toBe("done");
    expect(result.confidence).toBe("medium");
    expect(result.confidence).not.toBe("high");
  });
});
