-- Chekkam Phase 4 — Digital Document Verification.
-- Additive only: does not touch any existing column, row, or policy.
--
-- Expiry is deliberately NOT a new documents.status value (status stays
-- active|revoked — an explicit institution action). It's computed at verify
-- time from expiry_date, the same way "today" is computed rather than
-- stored — see lib/documents/verify.ts.

alter table documents add column expiry_date timestamptz;

alter table document_verification_logs
  drop constraint if exists document_verification_logs_result_check;
alter table document_verification_logs add constraint document_verification_logs_result_check
  check (result in ('genuine', 'tampered', 'revoked', 'expired', 'not_found'));
