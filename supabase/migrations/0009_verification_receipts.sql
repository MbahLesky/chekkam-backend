-- TASK 7 (2026-07-27): Verification Receipt (FR-111, Document Intelligence
-- Spec §7). Additive only: new table, no existing schema touched.

create table verification_receipts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete set null,
  file_hash text not null,
  result text not null,
  verified_by_org text,
  api_key_id uuid references api_keys(id) on delete set null,
  requested_by uuid references profiles(id) on delete set null,
  receipt_signature text not null,          -- ECDSA (Chekkam's own key, not the institution's) over the receipt payload
  receipt_verification_id text unique not null,
  created_at timestamptz default now()
);
create index idx_verification_receipts_receipt_id on verification_receipts(receipt_verification_id);
create index idx_verification_receipts_document_id on verification_receipts(document_id);

alter table verification_receipts enable row level security;
-- Receipts are looked up publicly by receipt_verification_id through the
-- service-role-backed API route (SRS 6.9 pattern — same as documents), not
-- read directly by an anon-key client, so this stays staff/requester-only.
create policy "verification_receipts_select_own" on verification_receipts
  for select using (requested_by = auth.uid());
create policy "verification_receipts_all_staff" on verification_receipts
  for all using (is_staff());
