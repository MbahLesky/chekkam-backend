-- Chekkam Phase 1 — AI Foundation.
-- Additive only: does not touch any existing table, column, or policy.

-- ai_predictions: append-only audit log of every AI analysis call (model,
-- latency, outcome), distinct from reports (which holds only the *current*
-- risk result per report). Feeds a future admin AI-analytics view.
create table ai_predictions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  source text not null check (source in ('ai','rule_based_fallback')),
  model text,
  input_type text check (input_type in ('text','link')),
  latency_ms int,
  risk_level text,
  risk_score int,
  category text,
  confidence text,
  error text,
  created_at timestamptz default now()
);
create index idx_ai_predictions_report_id on ai_predictions(report_id);

alter table ai_predictions enable row level security;
create policy "ai_predictions_select_staff" on ai_predictions for select using (is_staff());

-- ai_jobs: minimal scaffolding for a future async queue (OCR/media analysis
-- phase). Not enqueued or consumed by anything yet in Phase 1 — text analysis
-- remains synchronous, same as today.
create table ai_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending','processing','done','failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_ai_jobs_status on ai_jobs(status);

alter table ai_jobs enable row level security;
create policy "ai_jobs_all_staff" on ai_jobs for all using (is_staff());
