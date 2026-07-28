import { NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { assessDocument } from "@/lib/documents/assess-document";
import { verifierChannelFrom } from "@/lib/documents/verify";

const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 10 * 60;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * POST /api/documents/assess
 *
 * First runs exact Chekkam registry verification. If no registry record is
 * found, it returns a distinctly labelled Trust Report and, for PDFs, checks
 * an embedded standard digital signature. This avoids treating an unknown
 * scholarship/foreign certificate as automatically fraudulent.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`documents-assess:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many document checks. Please wait a few minutes and try again." } },
        { status: 429 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file is required (multipart/form-data).", "file");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError("File exceeds the 20MB document-check limit.", "file");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = await fileTypeFromBuffer(buffer);
    const result = await assessDocument(
      getSupabaseAdmin(),
      buffer,
      typeof form.get("verification_id") === "string" ? (form.get("verification_id") as string) : null,
      verifierChannelFrom(form.get("channel") as string | null, "share_intent"),
      sniffed?.mime ?? (file.type || undefined)
    );
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
