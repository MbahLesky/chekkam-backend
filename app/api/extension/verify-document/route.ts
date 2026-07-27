import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyByUpload } from "@/lib/documents/verify";
import { checkRateLimit } from "@/lib/rate-limit";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { parseBody } from "@/lib/validation/parse";

const bodySchema = z.object({ fileUrl: z.string().url() });
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 10 * 60;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

// Hostnames that would otherwise pass the IP-range check below (they
// resolve to loopback/private addresses too, but string-checking the
// hostname directly is a cheap belt-and-braces layer before the DNS check).
const BLOCKED_HOSTNAMES = new Set(["localhost", "chekkam-backend.railway.internal"]);

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

/**
 * Validates a user-supplied URL is safe to fetch server-side before ever
 * calling fetch() on it — this endpoint accepts an arbitrary URL from an
 * untrusted client (a right-clicked image/PDF link), which is a textbook
 * SSRF vector without this check (e.g. a crafted link pointing at Railway's
 * own private network or cloud metadata endpoints).
 */
export async function assertPubliclyFetchable(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ValidationError("Not a valid URL.", "fileUrl");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Only http/https links are supported.", "fileUrl");
  }
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new ValidationError("This URL cannot be fetched.", "fileUrl");
  }
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new ValidationError("Could not resolve this URL.", "fileUrl");
  }
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new ValidationError("This URL cannot be fetched.", "fileUrl");
  }
  return url;
}

/**
 * POST /api/extension/verify-document — the browser extension's "Verify
 * this document with Chekkam" context menu, for a right-clicked image/PDF
 * link. Fetches the file server-side, hashes it, and runs it through
 * verifyByUpload — the exact same Registry Verification engine every other
 * surface uses (hash-only lookup, no verification_id known ahead of time
 * for a bare link). Free, no API key, IP rate-limited, same posture as
 * /api/extension/check.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(`extension-verify:${clientIp}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many checks. Try again shortly." } },
        { status: 429 }
      );
    }

    const body = parseBody(bodySchema, await req.json());
    const url = await assertPubliclyFetchable(body.fileUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let upstream: Response;
    try {
      // redirect: "manual" — a redirect could point at a private address
      // even when the original hostname looked public; refuse rather than
      // silently follow it.
      upstream = await fetch(url.toString(), { signal: controller.signal, redirect: "manual" });
    } catch {
      throw new ValidationError("Could not download this file.", "fileUrl");
    } finally {
      clearTimeout(timeout);
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      throw new ValidationError("This link redirects — provide a direct file URL.", "fileUrl");
    }
    if (!upstream.ok) {
      throw new ValidationError("Could not download this file.", "fileUrl");
    }
    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_FILE_BYTES) {
      throw new ValidationError("File is too large.", "fileUrl");
    }

    const arrayBuffer = await upstream.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
      throw new ValidationError("File is too large.", "fileUrl");
    }

    const admin = getSupabaseAdmin();
    const result = await verifyByUpload(admin, Buffer.from(arrayBuffer), null, "extension");

    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
