import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { pickLang, tt } from "@/lib/i18n";
import { verifyPdfSignature } from "@/lib/documents/pdf-signature";

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 10 * 60;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/**
 * POST /api/documents/pdf-signature-check (FR-101, Trust Report Layer 1
 * only). Checks a standard PDF digital signature (PKCS#7/CMS embedded in
 * the file itself) from ANY issuer — this does not query the Chekkam
 * registry at all, unlike /api/documents/verify-upload. It answers "does
 * this foreign/unregistered PDF carry its own valid signature," not "is
 * this in our registry." Public/unauthenticated, rate-limited by IP, no
 * DB writes — this is not the full six-layer Trust Report (FR-100/102-107,
 * unbuilt); it is one deterministic signal a future Trust Report would
 * compose alongside others.
 *
 * multipart/form-data fields: file (required).
 */
export async function POST(req: NextRequest) {
  const preferredLang = pickLang(
    req.nextUrl.searchParams.get("lang"),
    req.headers.get("accept-language")
  );
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`pdf-signature-check:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: tt("rateLimitedVerify", preferredLang) } },
        { status: 429 }
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ValidationError(tt("fileRequired", preferredLang), "file");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError(tt("fileRequired", preferredLang), "file");
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new ValidationError("File exceeds the 20MB limit.", "file");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = verifyPdfSignature(buffer);
    return NextResponse.json({ mode: "pdf_signature_check", ...result });
  } catch (err) {
    return toErrorResponse(err, preferredLang);
  }
}
