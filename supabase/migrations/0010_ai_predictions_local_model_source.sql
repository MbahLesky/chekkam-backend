-- Widens ai_predictions.source to allow 'local_model' (FR-026/027) — the new
-- fallback tier between the OpenAI call and the pure-keyword rule-based
-- check (lib/ai/local-model.ts). Additive only: no existing row's source
-- value is touched, only the set of allowed future values grows.
-- Idempotent: drops the old constraint by name if present before recreating.

alter table ai_predictions drop constraint if exists ai_predictions_source_check;

alter table ai_predictions
  add constraint ai_predictions_source_check
  check (source in ('ai', 'local_model', 'rule_based_fallback'));
