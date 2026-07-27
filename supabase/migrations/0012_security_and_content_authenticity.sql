-- Chekkam Phase 9 — Safety Check + AI Content Authenticity.
-- Additive only: does not touch any existing table, column, or policy.
--
-- Two tables, not six — consolidating per-concept rather than creating
-- near-empty tables (same call made for reusing `evidence` in Phase 2).

-- security_checks: one row per on-demand "Safety Check" (link, QR, file, or
-- pasted text). This is the reframed "Device Security Scan" — user-submitted,
-- never autonomous device introspection (see docs/api/security.md).
create table security_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  input_type text not null check (input_type in ('link', 'qr', 'file', 'text')),
  input_summary text,
  risk_level text check (risk_level in ('low', 'medium', 'high', 'critical')),
  risk_score int,
  findings jsonb not null default '[]',
  recommended_action text,
  evidence_id uuid references evidence(id),
  created_at timestamptz default now()
);
create index idx_security_checks_user_id on security_checks(user_id);

alter table security_checks enable row level security;
create policy "security_checks_select_own_or_staff" on security_checks
  for select using (user_id = auth.uid() or is_staff());

-- content_authenticity_checks: AI-generated-content detection results.
-- video/audio are included in the CHECK constraint for schema-readiness
-- (per the spec's own "architecture ready if deferred" allowance) even
-- though no analysis pipeline exists for them yet — see
-- lib/ai/content-authenticity.ts's videoAuthenticityStatus/
-- audioAuthenticityStatus, which return status "not_supported" immediately.
create table content_authenticity_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  content_type text not null check (content_type in ('text', 'image', 'document', 'video', 'audio')),
  status text not null check (status in ('done', 'unavailable', 'not_supported', 'failed')),
  ai_likelihood text check (ai_likelihood in ('low', 'medium', 'high', 'unknown')),
  confidence text check (confidence in ('low', 'medium', 'high')),
  indicators jsonb not null default '{}',
  explanation text[] not null default '{}',
  evidence_id uuid references evidence(id),
  created_at timestamptz default now()
);
create index idx_content_authenticity_checks_user_id on content_authenticity_checks(user_id);

alter table content_authenticity_checks enable row level security;
create policy "content_authenticity_checks_select_own_or_staff" on content_authenticity_checks
  for select using (user_id = auth.uid() or is_staff());
