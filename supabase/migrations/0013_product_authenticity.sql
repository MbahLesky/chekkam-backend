-- Chekkam Phase 10 — Product Authenticity Platform.
-- Additive only: new tables + one additive CHECK-constraint widen on
-- institutions.type. Manufacturers are institutions with type='manufacturer',
-- reusing institution_members, signing_public_key, and the existing
-- admin-only POST /api/institutions onboarding flow — no new table for them.
--
-- product_code is the column name for the human-readable PRD-XXXX-XXXX id
-- (not product_id) to avoid colliding with product_verification_logs'
-- product_id FK column, mirroring documents.verification_id (FK-safe name)
-- vs. document_verification_logs.document_id (FK) + verification_id_attempted (text).

create table products (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete restrict,
  product_code text unique not null,   -- e.g. PRD-4F7K-9QRT
  product_name text not null,
  category text not null check (category in (
    'medicine', 'food', 'agriculture', 'electronics', 'construction_materials',
    'automotive_parts', 'engine_oil', 'cosmetics', 'luxury', 'alcohol',
    'beverages', 'retail', 'other'
  )),
  batch_number text,
  manufactured_at date,
  expiry_date date,
  product_hash text not null,
  signature text not null,
  qr_payload text not null,
  status text not null default 'active' check (status in ('active', 'recalled', 'stolen')),
  status_reason text,
  status_changed_at timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
create index idx_products_product_code on products(product_code);
create index idx_products_institution_id on products(institution_id);

-- product_verification_logs: every QR-scan/manual-lookup attempt, mirroring
-- document_verification_logs. Six results instead of four — see
-- lib/products/verify.ts for why "not_found" and "tampered" collapse into
-- a single "counterfeit" outcome here (denies a counterfeiter the ability
-- to distinguish "not yet issued" from "forged").
create table product_verification_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  product_code_attempted text,
  result text check (result in ('authentic', 'counterfeit', 'expired', 'recalled', 'stolen', 'unknown')),
  verifier_channel text check (verifier_channel in ('mobile', 'web', 'api')),
  created_at timestamptz default now()
);

alter table products enable row level security;
alter table product_verification_logs enable row level security;

-- products: manufacturer's own officers manage their own rows; staff manage
-- all. No public SELECT policy — anonymous reads go only through the
-- service-role-backed verify API, same convention as documents/evidence.
create policy "products_all_own_institution" on products for all
  using (
    exists (
      select 1 from institution_members m
      where m.institution_id = products.institution_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from institution_members m
      where m.institution_id = products.institution_id and m.user_id = auth.uid()
    )
  );
create policy "products_select_staff" on products for select using (is_staff());

-- product_verification_logs: staff-only direct access, same as document_verification_logs.
create policy "product_verification_logs_select_staff" on product_verification_logs
  for select using (is_staff());

-- Widen institutions.type so a manufacturer institution can be onboarded
-- through the existing POST /api/institutions flow with no new table.
alter table institutions drop constraint if exists institutions_type_check;
alter table institutions add constraint institutions_type_check
  check (type in (
    'ministry', 'exam_board', 'school', 'university', 'company', 'ngo',
    'media', 'civil_registry', 'other', 'manufacturer'
  ));
