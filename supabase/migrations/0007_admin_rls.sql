-- TASK 2 (2026-07-27): api_keys, api_usage_logs, and liaison_contacts were
-- created in 0001_init.sql without RLS, so Supabase's security advisor (and
-- the Handoff Brief) correctly flags them as UNRESTRICTED. None of these are
-- read through an anon-key-respecting client anywhere in the app today (the
-- admin API-key routes and lib/partner-auth.ts all use the service-role
-- client, which bypasses RLS entirely) — this migration is defense in depth
-- against a leaked anon key or direct DB access, not a fix to a live bug.
--
-- Admin-only, not analyst: api_keys/api_usage_logs back the partner API,
-- already gated to admin at the route layer (POST /api/admin/api-keys);
-- liaison_contacts holds CIRT/judicial contact details for lawful evidence
-- handoff, which is at least as sensitive. is_staff() (analyst included)
-- is deliberately not reused here.
--
-- Additive only: new function, new policies, no existing table/column/row touched.

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin','super_admin')
  );
$$;

alter table api_keys enable row level security;
create policy "api_keys_all_admin" on api_keys for all using (is_admin());

alter table api_usage_logs enable row level security;
create policy "api_usage_logs_all_admin" on api_usage_logs for all using (is_admin());

alter table liaison_contacts enable row level security;
create policy "liaison_contacts_all_admin" on liaison_contacts for all using (is_admin());
