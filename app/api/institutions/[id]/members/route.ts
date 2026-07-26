import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["officer", "admin"]).default("officer"),
});

/** POST /api/institutions/:id/members — admin adds an officer to an institution (SRS 6.3). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await requireUser(req);
    requireRole(profile, ["admin", "super_admin"]);

    const body = parseBody(addMemberSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("institution_members")
      .insert({ institution_id: id, user_id: body.user_id, role: body.role })
      .select("id, institution_id, user_id, role")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "institution.member_add",
      target_table: "institution_members",
      target_id: data.id,
      metadata: { institution_id: id, added_user_id: body.user_id, role: body.role },
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
