-- Phase 12: Cameroon Mobile Money Scam Intelligence.
--
-- Reuses the existing reports/campaigns/public_alerts engine rather than
-- creating a parallel system (per the spec's own "do not duplicate"
-- instruction) — the fingerprinting/campaign-clustering AI in
-- lib/campaigns/{fingerprint,matcher}.ts, the moderation workflow in
-- app/api/reports/[id]/route.ts, and public_alerts already implement most of
-- "detect repeated scam patterns," "merge duplicate reports," and "publish
-- verified fraud alerts." What's added here is purely additive: structured
-- fields so a mobile money report can be searched/filtered (previously
-- everything lived in free-text raw_content), and a "resolved" terminal
-- status distinct from "dismissed" (dismissed = not a real threat; resolved
-- = was real, now handled).

-- Fixes a pre-existing bug: reports_content_type_check never included
-- 'video'/'audio', even though app/api/reports/route.ts (and its Zod schema)
-- already branch on those values — every such submission would fail at the
-- database with a check-constraint violation.
alter table reports drop constraint if exists reports_content_type_check;
alter table reports add constraint reports_content_type_check
  check (content_type in ('text', 'link', 'image', 'file', 'video', 'audio'));

alter table reports drop constraint if exists reports_status_check;
alter table reports add constraint reports_status_check
  check (status in
    ('pending', 'analyzed', 'under_review', 'verified_threat', 'false_report', 'dismissed', 'resolved'));

-- Structured mobile-money fields — nullable, additive, usable by any report
-- (not only mobile-money ones): a phishing report can equally reference a
-- phone number. phone_number/wallet_number are also seeded into the report's
-- fingerprint (lib/campaigns/fingerprint.ts) at submission time so structured
-- submissions participate in campaign clustering even when the number isn't
-- typed into raw_content.
alter table reports add column if not exists phone_number text;
alter table reports add column if not exists wallet_number text;
alter table reports add column if not exists merchant_name text;
alter table reports add column if not exists transaction_reference text;
alter table reports add column if not exists network_provider text
  check (network_provider is null or network_provider in ('mtn', 'orange', 'express_union', 'other'));

create index if not exists idx_reports_phone_number on reports(phone_number) where phone_number is not null;
create index if not exists idx_reports_wallet_number on reports(wallet_number) where wallet_number is not null;
