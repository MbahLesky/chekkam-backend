import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveOptionalUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { parseBody } from "@/lib/validation/parse";
import { runSafetyCheck } from "@/lib/security/safety-check";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const RATE_LIMIT = 15;
const RATE_WINDOW_SECONDS = 10 * 60;

// Defined locally rather than in lib/validation/schemas.ts, which has other
// in-flight uncommitted work right now — keeps this change cleanly separable.
const jsonCheckSchema = z.object({
  input_type: z.enum(["link", "qr", "text"]),
  url: z.string().url().max(2048).optional(),
  text: z.string().min(1).max(5000).optional(),
  language: z.enum(["en", "fr"]).optional(),
});

/**
 * POST /api/security/check — on-demand "Safety Check" for a link, QR
 * payload, uploaded file, or pasted text (e.g. a forwarded SMS/email).
 * Deliberately NOT autonomous device scanning — see docs/api/security.md
 * for why (installed-app/SMS/clipboard/browser-history scanning are
 * platform-blocked or would undermine trust in this app; this is the
 * buildable, consent-respecting alternative). Anonymous submission allowed,
 * same policy as /api/reports and /api/ocr/upload.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`security:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many safety checks from this network. Please wait a bit and try again.",
          },
        },
        { status: 429 }
      );
    }

    const userId = await resolveOptionalUserId(req);
    const admin = getSupabaseAdmin();
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw new ValidationError("file is required (multipart/form-data).", "file");
      }
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new ValidationError("file is required (multipart/form-data).", "file");
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new ValidationError("File is too large (10MB limit).", "file");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const sniffed = await fileTypeFromBuffer(buffer);
      if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed.mime)) {
        throw new ValidationError("Unsupported file type. Allowed: PNG, JPEG, WEBP, PDF.", "file");
      }
      const language = (form.get("language") as "en" | "fr" | null) ?? "en";

      const result = await runSafetyCheck(admin, {
        inputType: "file",
        fileBuffer: buffer,
        fileName: file.name,
        mimeType: sniffed.mime,
        userId,
        language,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const body = parseBody(jsonCheckSchema, await req.json());
    if (body.input_type === "text") {
      if (!body.text) throw new ValidationError("text is required for input_type=text.", "text");
      const result = await runSafetyCheck(admin, {
        inputType: "text",
        text: body.text,
        userId,
        language: body.language,
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (!body.url) throw new ValidationError("url is required for input_type=link/qr.", "url");
    const result = await runSafetyCheck(admin, {
      inputType: body.input_type,
      url: body.url,
      userId,
      language: body.language,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
