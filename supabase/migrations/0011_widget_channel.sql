-- Widens reports.channel and document_verification_logs.verifier_channel to
-- allow 'widget' — the embeddable website widget an institution pastes into
-- its own site (distinct from 'extension' so adoption/impact reporting can
-- tell institutional-embed traffic apart from direct citizen web/extension
-- traffic). Additive only: no existing row's channel value is touched, only
-- the set of allowed future values grows. Idempotent: drops the old
-- constraint by name if present before recreating.

alter table reports drop constraint if exists reports_channel_check;
alter table reports add constraint reports_channel_check
  check (channel in ('mobile', 'web', 'whatsapp', 'telegram', 'api', 'extension', 'share_intent', 'widget'));

alter table document_verification_logs drop constraint if exists document_verification_logs_verifier_channel_check;
alter table document_verification_logs add constraint document_verification_logs_verifier_channel_check
  check (verifier_channel in ('mobile', 'web', 'api', 'whatsapp', 'telegram', 'extension', 'widget'));
