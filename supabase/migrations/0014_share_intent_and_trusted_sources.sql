-- Share-to-Chekkam has its own audit channel so mobile-originated checks are
-- distinguishable from a normal in-app scan. This migration is additive and
-- leaves all prior verification logs intact.

alter table document_verification_logs drop constraint if exists document_verification_logs_verifier_channel_check;
alter table document_verification_logs add constraint document_verification_logs_verifier_channel_check
  check (verifier_channel in ('mobile', 'web', 'api', 'whatsapp', 'telegram', 'extension', 'widget', 'share_intent'));

-- Official social accounts can be registered only after staff verify them.
-- `trusted_sources.value` stores a canonical URL such as
-- https://www.tiktok.com/@publisher; source matching pins both host and path.
alter table trusted_sources drop constraint if exists trusted_sources_type_check;
alter table trusted_sources add constraint trusted_sources_type_check
  check (type in (
    'website', 'facebook_page', 'twitter_account', 'telegram_channel', 'phone_number',
    'youtube_channel', 'tiktok_account', 'instagram_account'
  ));

create index if not exists idx_trusted_sources_verified on trusted_sources (verified);
