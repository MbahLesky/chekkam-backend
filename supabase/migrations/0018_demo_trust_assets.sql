-- Durable storage for the two demo-kit files that are deliberately NEVER
-- registered as real documents (scripts/seed-demo-trust.ts): the tampered
-- copy and the unregistered/"not found" file. Both must stay downloadable
-- and byte-stable across the seed script's own re-runs and across repeated
-- admin downloads, but they must never live in `documents` — that table's
-- presence alone would make them "registered," defeating the whole point of
-- proving TAMPERED and NOT_FOUND against real, un-doctored verification
-- logic. A small standalone table, following the same bytea-storage
-- approach as `documents.original_file_data` (0017) rather than introducing
-- a new storage provider.
--
-- `key` is a fixed, human-readable slug ('tampered', 'unregistered') rather
-- than a generated id — the seed script always upserts the same two rows,
-- so re-running it never accumulates stale demo assets.

create table if not exists demo_trust_assets (
  key text primary key,
  file_data bytea not null,
  mime_type text not null,
  file_name text not null,
  updated_at timestamptz not null default now()
);

comment on table demo_trust_assets is
  'Demo-kit files intentionally never registered in documents (tampered copy, unregistered file). See scripts/seed-demo-trust.ts.';
