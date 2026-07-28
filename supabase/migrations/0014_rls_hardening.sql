-- Phase 11 security audit (2026-07-28): profiles_update_own (0001_init.sql)
-- had no WITH CHECK, so Postgres reused its USING clause for both read and
-- write sides. That clause only constrains WHICH ROW (id = auth.uid()) with
-- no restriction on which columns/values can be written — since every
-- authorization check in the app (is_staff()/is_admin()/requireRole) trusts
-- profiles.role as the sole source of truth, and the anon key + PostgREST
-- endpoint are reachable directly from any browser, any signed-up citizen
-- could PATCH their own profiles row to role: 'super_admin' and bypass the
-- app entirely. Fix: add an explicit WITH CHECK that only allows the update
-- when the row's role is unchanged from what it already is.
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from profiles p where p.id = auth.uid())
  );

-- Same root-cause pattern in safety_alerts_insert_own (row-ownership check
-- with no restriction on the inserted status/escalation columns). No live
-- exploit path today (app/api/safety-alerts/route.ts always inserts via the
-- service-role client with status: 'pending'), but closing it defensively
-- since it's directly reachable via PostgREST with just the anon key.
drop policy if exists "safety_alerts_insert_own" on safety_alerts;
create policy "safety_alerts_insert_own" on safety_alerts
  for insert
  with check (
    reporter_id = auth.uid()
    and status = 'pending'
    and escalated_to_liaison = false
  );
