import { NextResponse } from "next/server";

// The mobile client fetches this at runtime, so do not let Next.js bake a
// build-time environment snapshot into the route.
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/**
 * GET /api/client-config
 *
 * Public bootstrap configuration for clients that cannot receive compile-time
 * Supabase defines. This endpoint is intentionally restricted to the two
 * values that Supabase documents as safe for public clients.
 */
export function GET() {
  // Bracket notation is deliberate: it keeps these reads at request time in
  // deployed environments rather than allowing build-time env substitution.
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseAnonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ configured: false }, { status: 503, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json(
    {
      configured: true,
      supabase_url: supabaseUrl,
      supabase_anon_key: supabaseAnonKey,
    },
    { headers: NO_STORE_HEADERS }
  );
}
