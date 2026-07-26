import { NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveOptionalUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { hashDocument } from "@/lib/crypto/sign";
import { extractText } from "@/lib/ai/ocr";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * POST /api/ocr/upload — extract text from an uploaded image or PDF.
 * Anonymous submission allowed (same policy as /api/reports and
 * /api/documents/verify-upload); attributes to a session when one is
 * present. multipart/form-data field: file (required).
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`ocr:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many OCR requests from this network. Please wait a bit and try again.",
          },
        },
        { status: 429 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file is required (multipart/form-data).", "file");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError("File is too large (10MB limit).", "file");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Never trust the client-supplied Content-Type — sniff actual magic bytes.
    const sniffed = await fileTypeFromBuffer(buffer);
    const mimeType = sniffed?.mime;
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new ValidationError(
        "Unsupported file type. Allowed: PNG, JPEG, WEBP, PDF.",
        "file"
      );
    }

    const uploadedBy = await resolveOptionalUserId(req);
    const admin = getSupabaseAdmin();
    const fileHash = hashDocument(buffer);

    const storagePath = `${fileHash}-${Date.now()}.${sniffed.ext}`;
    const { error: uploadError } = await admin.storage
      .from("ocr-uploads")
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;

    const result = await extractText(buffer, mimeType);

    const { data: inserted, error: insertError } = await admin
      .from("evidence")
      .insert({
        file_hash: fileHash,
        file_type: mimeType,
        uploaded_by: uploadedBy,
        status: result.status,
        processing_time_ms: result.processingTimeMs,
        ocr_text: result.status === "done" ? result.extracted_text : null,
        confidence: result.status === "done" ? result.confidence : null,
        source: result.status === "done" ? result.source : null,
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
