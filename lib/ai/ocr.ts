import { z } from "zod";
import pdfParse from "pdf-parse";
import { getAiConfig } from "@/lib/ai/config";

const visionResultSchema = z.object({
  extracted_text: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
});

export type OcrSource = "vision_ai" | "pdf_text_layer" | "pdf_vision_ocr";

export type OcrResult =
  | {
      status: "done";
      extracted_text: string;
      confidence: "low" | "medium" | "high";
      source: OcrSource;
      processingTimeMs: number;
    }
  | { status: "unavailable"; processingTimeMs: number }
  | { status: "failed"; error: string; processingTimeMs: number };

/**
 * Vision calls take longer than the short text-risk-analysis prompt
 * (lib/ai/risk-analysis.ts) — a full screenshot/photo, and up to
 * MAX_PDF_PAGES rendered pages, need more headroom than that call's 8s.
 */
const OCR_TIMEOUT_MS = 20_000;
const MAX_PDF_PAGES = 5;
/** Below this many characters, a PDF's embedded text layer is treated as
 * effectively absent (e.g. a handful of stray glyphs from a scan artifact),
 * and we fall back to rasterizing pages for vision OCR instead. */
const MIN_TEXT_LAYER_CHARS = 20;

const OCR_SYSTEM_PROMPT =
  "You transcribe all visible text from an image exactly as written, " +
  "preserving line breaks where they visually appear. Do not summarize, " +
  "translate, or omit anything — including partially legible text (best " +
  "effort). If the image contains no readable text, return an empty string. " +
  'Respond with JSON only: {"extracted_text": string, "confidence": "low"|"medium"|"high"} ' +
  "where confidence reflects image clarity/legibility, not your certainty about meaning.";

async function extractTextFromImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ extracted_text: string; confidence: "low" | "medium" | "high" } | null> {
  const { apiKey, model } = getAiConfig();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe all text in this image." },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return null;

    const parsed = visionResultSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Renders up to MAX_PDF_PAGES pages of a PDF to PNG buffers for scanned documents. */
async function rasterizePdfPages(buffer: Buffer): Promise<Buffer[]> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const images: Buffer[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");
    await page.render({
      // @napi-rs/canvas's context is structurally compatible with what
      // pdfjs-dist needs at runtime; its types just don't line up exactly.
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    images.push(canvas.toBuffer("image/png"));
  }

  return images;
}

async function extractTextFromPdf(
  buffer: Buffer
): Promise<{ extracted_text: string; confidence: "low" | "medium" | "high"; source: OcrSource } | null> {
  const parsed = await pdfParse(buffer);
  const textLayer = parsed.text.trim();

  if (textLayer.length >= MIN_TEXT_LAYER_CHARS) {
    return { extracted_text: textLayer, confidence: "high", source: "pdf_text_layer" };
  }

  const pageImages = await rasterizePdfPages(buffer);
  if (pageImages.length === 0) {
    return { extracted_text: "", confidence: "low", source: "pdf_vision_ocr" };
  }

  const pageResults = await Promise.all(
    pageImages.map((img) => extractTextFromImage(img, "image/png"))
  );
  if (pageResults.every((r) => r === null)) return null;

  const confidences = pageResults.map((r) => r?.confidence ?? "low");
  const overallConfidence: "low" | "medium" | "high" = confidences.includes("low")
    ? "low"
    : confidences.includes("medium")
      ? "medium"
      : "high";

  const combinedText = pageResults
    .map((r, i) => `--- Page ${i + 1} ---\n${r?.extracted_text ?? ""}`)
    .join("\n\n");

  return { extracted_text: combinedText, confidence: overallConfidence, source: "pdf_vision_ocr" };
}

/**
 * Extracts text from an uploaded image or PDF. Images always go through the
 * vision model; PDFs try their embedded text layer first (cheap, exact) and
 * only fall back to rendering pages through the same vision path if that
 * layer is empty (i.e. a scanned document with no real text layer).
 *
 * Unlike analyzeContent()'s rule-based fallback, there is no honest non-AI
 * way to do OCR — status stays "unavailable" rather than fabricating a
 * result when OPENAI_API_KEY is missing or every call fails.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const { apiKey } = getAiConfig();
  const startedAt = Date.now();

  if (!apiKey) {
    return { status: "unavailable", processingTimeMs: Date.now() - startedAt };
  }

  try {
    if (mimeType === "application/pdf") {
      const result = await extractTextFromPdf(buffer);
      if (!result) {
        return { status: "unavailable", processingTimeMs: Date.now() - startedAt };
      }
      return { status: "done", ...result, processingTimeMs: Date.now() - startedAt };
    }

    const result = await extractTextFromImage(buffer, mimeType);
    if (!result) {
      return { status: "unavailable", processingTimeMs: Date.now() - startedAt };
    }
    return {
      status: "done",
      ...result,
      source: "vision_ai",
      processingTimeMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown OCR error",
      processingTimeMs: Date.now() - startedAt,
    };
  }
}
