import { SupabaseClient } from "@supabase/supabase-js";

export type AiJobStatus = "pending" | "processing" | "done" | "failed";

export type AiJob = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: AiJobStatus;
  attempts: number;
  error: string | null;
};

/**
 * Minimal DB-backed job queue scaffolding for future async AI work (OCR/media
 * analysis). Not enqueued or consumed anywhere yet in Phase 1 — text analysis
 * stays synchronous. Follows the same thin-CRUD-helper style as
 * lib/campaigns/matcher.ts.
 */
export async function enqueueJob(
  admin: SupabaseClient,
  jobType: string,
  payload: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await admin
    .from("ai_jobs")
    .insert({ job_type: jobType, payload })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Atomically claims the oldest pending job of `jobType`, if any. */
export async function claimNextJob(
  admin: SupabaseClient,
  jobType: string
): Promise<AiJob | null> {
  const { data: candidate, error: selectError } = await admin
    .from("ai_jobs")
    .select("*")
    .eq("job_type", jobType)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!candidate) return null;

  const { data: claimed, error: updateError } = await admin
    .from("ai_jobs")
    .update({
      status: "processing",
      attempts: candidate.attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;

  return (claimed as AiJob) ?? null;
}

export async function completeJob(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin
    .from("ai_jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function failJob(
  admin: SupabaseClient,
  id: string,
  errorMessage: string
): Promise<void> {
  const { error } = await admin
    .from("ai_jobs")
    .update({ status: "failed", error: errorMessage, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
