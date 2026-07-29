import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  analyzeTextAuthenticity,
  analyzeImageAuthenticity,
  analyzeDocumentAuthenticity,
  analyzeVideoAuthenticity,
  analyzeAudioAuthenticity,
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

describe("video/audio — metadata signature scan (no model/API involved)", () => {
  it("video: reports unavailable when no known AI-tool signature is present", () => {
    const result = analyzeVideoAuthenticity(Buffer.from("just some ordinary video bytes"));
    expect(result.status).toBe("unavailable");
    expect(result.confidence).toBeNull();
  });

  it("video: reports a real match, never fabricated, when a known tool identifier is embedded", () => {
    const result = analyzeVideoAuthenticity(Buffer.from("...moov...udta...RunwayML export..."));
    expect(result.status).toBe("done");
    expect(result.ai_likelihood).toBe("high");
    expect(result.confidence).toBe("medium");
    expect(result.indicators.matched_tool).toBe("runwayml");
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("audio: reports unavailable when no known AI-tool signature is present", () => {
    const result = analyzeAudioAuthenticity(Buffer.from("just some ordinary audio bytes"));
    expect(result.status).toBe("unavailable");
  });

  it("audio: reports a real match when a known voice-clone tool identifier is embedded", () => {
    const result = analyzeAudioAuthenticity(Buffer.from("ID3 comment: generated via ElevenLabs API"));
    expect(result.status).toBe("done");
    expect(result.indicators.matched_tool).toBe("elevenlabs");
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
