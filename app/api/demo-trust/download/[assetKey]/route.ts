import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { byteaToBuffer } from "@/lib/documents/bytea";
import { toErrorResponse } from "@/lib/errors";

const VALID_KEYS = new Set(["tampered", "unregistered"]);

/**
 * GET /api/demo-trust/download/:assetKey — serves the two demo-kit files
 * that are deliberately never registered as real documents (tampered copy,
 * unregistered file — scripts/seed-demo-trust.ts, demo_trust_assets table).
 * Admin/analyst only, same posture as /api/demo-trust and
 * /api/documents/:id/download-original — not a public/anonymous endpoint.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetKey: string }> }
) {
  try {
    const { assetKey } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin", "analyst"]);

    if (!VALID_KEYS.has(assetKey)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Unknown demo asset." } },
        { status: 404 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: asset } = await admin
      .from("demo_trust_assets")
      .select("file_data, mime_type, file_name")
      .eq("key", assetKey)
      .maybeSingle();

    const bytes = byteaToBuffer(asset?.file_data as string | null | undefined);
    if (!asset || !bytes) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "This demo asset hasn't been generated yet — run `npm run seed:demo-trust` first.",
          },
        },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": asset.mime_type,
        "Content-Disposition": `attachment; filename="${asset.file_name.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
