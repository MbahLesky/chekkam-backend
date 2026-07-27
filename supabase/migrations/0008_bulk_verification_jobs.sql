-- TASK 6 (2026-07-27): Enterprise Bulk Verification (FR-110, Document
-- Intelligence Spec §6). Additive only: new table, no existing schema touched.
--
-- results is denormalized (jsonb) rather than a child table on purpose: a
-- bulk job's rows are an immutable snapshot of what Registry Verification
-- returned at run time, not live-updating records — a document revoked
-- after the job ran should NOT silently change a past job's report.

create table bulk_verification_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references profiles(id) on delete set null,
  api_key_id uuid references api_keys(id) on delete set null,
  total_items int not null default 0,
  processed_items int not null default 0,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  results jsonb not null default '[]',
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index idx_bulk_jobs_requested_by on bulk_verification_jobs(requested_by);
create index idx_bulk_jobs_api_key_id on bulk_verification_jobs(api_key_id);

alter table bulk_verification_jobs enable row level security;
-- Staff (any authenticated role checked at the route layer) can see jobs
-- they requested; admin/super_admin/analyst can see all for support/audit.
create policy "bulk_jobs_select_own" on bulk_verification_jobs
  for select using (requested_by = auth.uid());
create policy "bulk_jobs_all_staff" on bulk_verification_jobs
  for all using (is_staff());
