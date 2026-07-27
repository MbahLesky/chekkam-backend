import { NextRequest, NextResponse } from "next/server";

/**
 * Central CORS for every /api/* and /v1/* route (Phase 2 spec §6.1 + the
 * Vercel-hosted Flutter web build). Allowed origins: chrome-extension://*
 * (any extension id), any *.vercel.app subdomain (production + preview
 * deploys, so a new preview URL never needs an env var update), and
 * whatever's listed in ALLOWED_WEB_ORIGIN (comma-separated). A single shared
 * place means no individual route can forget to handle it.
 *
 * Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` (function
 * must be named/exported `proxy`) — see the version-16 upgrade guide.
 */
const allowedOrigins = (process.env.ALLOWED_WEB_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin.startsWith("chrome-extension://")) return true;
  if (VERCEL_PREVIEW_ORIGIN.test(origin)) return true;
  return allowedOrigins.includes(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "null",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*", "/v1/:path*"],
};
