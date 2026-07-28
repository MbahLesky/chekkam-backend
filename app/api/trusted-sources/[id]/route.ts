import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

/** Removes a source from matching immediately while retaining an audit event. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("trusted_sources")
      .delete()
      .eq("id", id)
      .select("id, name, type, value")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Trusted source not found." } },
        { status: 404 }
      );
    }

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "trusted_source.remove",
      target_table: "trusted_sources",
      target_id: id,
      metadata: { type: data.type, value: data.value },
    });
    return NextResponse.json({ removed: data.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
