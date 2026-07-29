-- Stores an invisibly-marked copy of the original signed file for supported
-- formats (PDF/DOCX/PNG), so an institution officer can re-download exactly
-- what they uploaded — same visible content, no watermark, no visible
-- change — with a verification marker embedded in a format-appropriate
-- invisible location (PDF Info dict entry, DOCX custom document property,
-- PNG tEXt chunk). file_hash/signature continue to cover this embedded
-- version (embedding happens before hashing), so the existing hash-based
-- verifyByUpload() path needs no changes at all to recognize it as genuine.
--
-- Nullable throughout: unsupported formats (anything other than PDF/DOCX/
-- PNG — notably video, which has no standard invisible-marker location and
-- is intentionally not attempted) sign exactly as before, with no original
-- retained. This is an explicit, approved architecture change from the
-- previous hash-only-storage design (CLAUDE.md §10.1) — see
-- chekkam/docs/DOCUMENTATION.md for the recorded decision.
--
-- No RLS policy changes needed: the existing "documents_all_own_institution"
-- and "documents_select_staff" policies already scope read access to
-- exactly the right audience (the signing institution's own members, plus
-- staff) — the same people who should be able to re-download it.

alter table documents add column if not exists original_file_data bytea;
alter table documents add column if not exists original_file_mime_type text;
alter table documents add column if not exists original_file_name text;
