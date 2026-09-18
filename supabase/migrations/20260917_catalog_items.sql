-- Per-company product/service nomenclator (catalog) for invoice lines.

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  code text not null default '',
  name text not null,
  kind text not null default 'service',
  unit_code text not null default 'E48',
  unit_price numeric not null default 0,
  tva_rate numeric not null default 21,
  vat_category text not null default 'S',
  vat_exemption_reason text not null default '',
  discount_percent numeric not null default 0,
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint catalog_items_kind_check check (kind in ('service', 'product')),
  constraint catalog_items_name_check check (length(btrim(name)) > 0)
);

create index if not exists catalog_items_company_id_idx on catalog_items(company_id);
create index if not exists catalog_items_user_id_idx on catalog_items(user_id);
create index if not exists catalog_items_last_used_idx on catalog_items(company_id, last_used_at desc nulls last);

create unique index if not exists catalog_items_company_name_idx
  on catalog_items (company_id, lower(btrim(name)))
  where company_id is not null;

create unique index if not exists catalog_items_user_name_idx
  on catalog_items (user_id, lower(btrim(name)))
  where company_id is null;

create unique index if not exists catalog_items_company_code_idx
  on catalog_items (company_id, lower(btrim(code)))
  where company_id is not null and btrim(code) <> '';

create unique index if not exists catalog_items_user_code_idx
  on catalog_items (user_id, lower(btrim(code)))
  where company_id is null and btrim(code) <> '';

alter table catalog_items enable row level security;

drop policy if exists catalog_items_own on catalog_items;
create policy catalog_items_own on catalog_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table catalog_items to authenticated, service_role;
