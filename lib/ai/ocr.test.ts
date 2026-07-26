import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("pdf-parse", () => ({ default: vi.fn() }));

import pdfParse from "pdf-parse";
import { extractText } from "@/lib/ai/ocr";

describe("extractText — no OPENAI_API_KEY", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.mocked(pdfParse).mockReset();
  });

  it("returns unavailable for an image, rather than fabricating a result", async () => {
    const result = await extractText(Buffer.from("fake-image-bytes"), "image/png");
    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable for a PDF too, without ever touching pdf-parse", async () => {
    const result = await extractText(Buffer.from("fake-pdf-bytes"), "application/pdf");
    expect(result.status).toBe("unavailable");
    expect(pdfParse).not.toHaveBeenCalled();
  });
});

describe("extractText — PDF with a usable text layer", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.mocked(pdfParse).mockReset();
  });

  it("uses the embedded text layer directly and never calls the vision model", async () => {
    vi.mocked(pdfParse).mockResolvedValue({ text: "A".repeat(200) } as Awaited<
      ReturnType<typeof pdfParse>
    >);
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await extractText(Buffer.from("fake-pdf-bytes"), "application/pdf");

    expect(result.status).toBe("done");
    if (result.status === "done") {
      expect(result.source).toBe("pdf_text_layer");
      expect(result.extracted_text).toBe("A".repeat(200));
      expect(result.confidence).toBe("high");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
