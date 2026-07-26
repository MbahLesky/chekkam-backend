-- Chekkam Phase 2 — OCR.
-- Additive only: extends the existing evidence table (already provisioned
-- with ocr_text/exif_metadata/perceptual_hash in 0001_init.sql but never
-- wired up) rather than creating a parallel ocr_results table.

alter table evidence add column confidence text;
alter table evidence add column processing_time_ms int;
alter table evidence add column uploaded_by uuid references profiles(id);
alter table evidence add column status text not null default 'done'
  check (status in ('done', 'unavailable', 'failed'));
alter table evidence add column source text
  check (source in ('vision_ai', 'pdf_text_layer', 'pdf_vision_ocr'));

create index idx_evidence_uploaded_by on evidence(uploaded_by);

-- Private bucket: every access goes through the API (service-role client),
-- same as the rest of this repo — no direct client-side storage calls.
insert into storage.buckets (id, name, public)
  values ('ocr-uploads', 'ocr-uploads', false)
  on conflict (id) do nothing;

create policy "ocr_uploads_staff_read" on storage.objects for select
  using (bucket_id = 'ocr-uploads' and is_staff());
