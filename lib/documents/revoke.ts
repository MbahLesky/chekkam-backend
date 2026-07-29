import { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one and only document status-change path (SRS FR-046). Extracted from
 * app/api/documents/[id]/{revoke,restore}/route.ts so any future caller
 * (the demo-trust seed script included) performs the exact same update +
 * audit-log write instead of a re-implementation. The HTTP routes are now
 * thin wrappers around these functions — behavior is unchanged.
 *
 * Callers are responsible for their own authorization check before calling
 * this (web routes: requireRole + institution-membership check via
 * fetchDocumentForStatusChange's institution_id; scripts: the same rule
 * applies conceptually — never call these without deciding who's allowed to).
 */
export type DocumentStatusUpdate = {
  id: string;
  status: string;
  revoked_at: string | null;
  revocation_reason: string | null;
};

export async function fetchDocumentForStatusChange(
  admin: SupabaseClient,
  documentId: string
): Promise<{ id: string; institution_id: string; status: string } | null> {
  const { data } = await admin
    .from("documents")
    .select("id, institution_id, status")
    .eq("id", documentId)
    .maybeSingle();
  return data ?? null;
}

export async function revokeDocumentCore(
  admin: SupabaseClient,
  documentId: string,
  reason: string,
  actorId: string | null
): Promise<DocumentStatusUpdate> {
  const { data: updated, error } = await admin
    .from("documents")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revocation_reason: reason,
    })
    .eq("id", documentId)
    .select("id, status, revoked_at, revocation_reason")
    .single();

  if (error) throw error;

  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action: "document.revoke",
    target_table: "documents",
    target_id: documentId,
    metadata: { reason },
  });

  return updated;
}

export async function restoreDocumentCore(
  admin: SupabaseClient,
  documentId: string,
  actorId: string | null
): Promise<DocumentStatusUpdate> {
  const { data: updated, error } = await admin
    .from("documents")
    .update({ status: "active", revoked_at: null, revocation_reason: null })
    .eq("id", documentId)
    .select("id, status, revoked_at, revocation_reason")
    .single();

  if (error) throw error;

  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action: "document.restore",
    target_table: "documents",
    target_id: documentId,
  });

  return updated;
}
