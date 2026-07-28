import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveOptionalUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashDocument } from "@/lib/crypto/sign";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { parseBody } from "@/lib/validation/parse";
import {
  analyzeTextAuthenticity,
  analyzeImageAuthenticity,
  analyzeDocumentAuthenticity,
  videoAuthenticityStatus,
  audioAuthenticityStatus,
  ContentAuthenticityResult,
} from "@/lib/ai/content-authenticity";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DOCUMENT_MIME_TYPES = new Set(["application/pdf"]);
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 10 * 60;

const textSchema = z.object({
  content_type: z.literal("text"),
  text: z.string().min(1).max(8000),
});

/**
 * POST /api/ai/content-authenticity — best-effort, advisory-only assessment
 * of whether submitted text/image/document shows AI-generation/manipulation
 * indicators. NOT a forensic tool — see lib/ai/content-authenticity.ts's
 * confidence cap and docs/api/content-authenticity.md. video/audio return
 * "not_supported" immediately (architecture-ready, not implemented).
 * Anonymous submission allowed, same policy as /api/ocr/upload.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`content-authenticity:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests from this network. Please wait a bit and try again.",
          },
        },
        { status: 429 }
      );
    }

    const userId = await resolveOptionalUserId(req);
    const admin = getSupabaseAdmin();
    const contentType = req.headers.get("content-type") ?? "";

    let result: ContentAuthenticityResult;
    let checkContentType: "text" | "image" | "document" | "video" | "audio";
    let evidenceId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const kind = form.get("kind");
      if (!(file instanceof File)) {
        throw new ValidationError("file is required (multipart/form-data).", "file");
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new ValidationError("File is too large (10MB limit).", "file");
      }
      if (kind === "video") {
        checkContentType = "video";
        result = videoAuthenticityStatus();
      } else if (kind === "audio") {
        checkContentType = "audio";
        result = audioAuthenticityStatus();
      } else {
        const buffer = Buffer.from(await file.arrayBuffer());
        const sniffed = await fileTypeFromBuffer(buffer);
        const mime = sniffed?.mime;
        if (!mime || (!IMAGE_MIME_TYPES.has(mime) && !DOCUMENT_MIME_TYPES.has(mime))) {
          throw new ValidationError(
            "Unsupported file type. Allowed: PNG, JPEG, WEBP, PDF (or kind=video/audio).",
            "file"
          );
        }

        const { data: evidence } = await admin
          .from("evidence")
          .insert({ file_hash: hashDocument(buffer), file_type: mime })
          .select("id")
          .single();
        evidenceId = evidence?.id ?? null;

        if (DOCUMENT_MIME_TYPES.has(mime)) {
          checkContentType = "document";
          result = await analyzeDocumentAuthenticity(buffer, mime);
        } else {
          checkContentType = "image";
          result = await analyzeImageAuthenticity(buffer, mime);
        }
      }
    } else {
      const body = parseBody(textSchema, await req.json());
      checkContentType = "text";
      result = await analyzeTextAuthenticity(body.text);
    }

    const { data: inserted, error } = await admin
      .from("content_authenticity_checks")
      .insert({
        user_id: userId,
        content_type: checkContentType,
        status: result.status,
        ai_likelihood: result.ai_likelihood,
        confidence: result.confidence,
        indicators: result.indicators,
        explanation: result.explanation,
        evidence_id: evidenceId,
      })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
