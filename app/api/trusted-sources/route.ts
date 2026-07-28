import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/auth";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { parseBody } from "@/lib/validation/parse";

const sourceTypes = [
  "website",
  "facebook_page",
  "twitter_account",
  "telegram_channel",
  "youtube_channel",
  "tiktok_account",
  "instagram_account",
] as const;

const createSourceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(sourceTypes),
  value: z.string().trim().min(8).max(2048),
  institution_id: z.string().uuid().nullable().optional(),
});

function assertPublicSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
    return url.toString();
  } catch {
    throw new ValidationError("Source value must be a complete public http(s) URL.", "value");
  }
}

/**
 * Staff-only registry for official publisher domains and social accounts.
 * A source is marked verified only by a Chekkam admin here; citizen media
 * reports can therefore distinguish an official account match from an
 * unverified lookalike without claiming that every post is true.
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("trusted_sources")
      .select("id, institution_id, name, type, value, verified, created_at, institutions(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const sources = (data ?? []).map((source) => {
      const institution = Array.isArray(source.institutions)
        ? source.institutions[0]
        : source.institutions;
      return { ...source, institution_name: institution?.name ?? null };
    });
    return NextResponse.json({ sources });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);
    const body = parseBody(createSourceSchema, await req.json());
    const value = assertPublicSourceUrl(body.value);
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("trusted_sources")
      .insert({
        institution_id: body.institution_id ?? null,
        name: body.name,
        type: body.type,
        value,
        verified: true,
      })
      .select("id, institution_id, name, type, value, verified, created_at")
      .single();
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "trusted_source.verify",
      target_table: "trusted_sources",
      target_id: data.id,
      metadata: { type: data.type, value: data.value, institution_id: data.institution_id },
    });

    return NextResponse.json({ source: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
