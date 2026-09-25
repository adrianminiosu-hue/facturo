-- Company profile: legal form + extra addresses / bank accounts / contacts
-- (same pattern as clients). Flat companies.* columns stay the defaults.

alter table companies
  add column if not exists legal_form text not null default '';

create table if not exists company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  contact_role text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists company_contacts_company_id_idx on company_contacts(company_id);
create index if not exists company_contacts_user_id_idx on company_contacts(user_id);

create table if not exists company_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  address_type text not null default 'sediu_social',
  address text not null default '',
  city text not null default '',
  county text not null default '',
  county_code text not null default '',
  postal_code text not null default '',
  country text not null default 'RO',
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists company_addresses_company_id_idx on company_addresses(company_id);
create index if not exists company_addresses_user_id_idx on company_addresses(user_id);

create unique index if not exists company_addresses_one_default_idx
  on company_addresses (company_id)
  where is_default = true;

create table if not exists company_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_name text not null default '',
  iban text not null default '',
  bic text not null default '',
  iban_currency text not null default 'LEI',
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  constraint company_bank_accounts_currency_check check (iban_currency in ('LEI', 'EUR'))
);

create index if not exists company_bank_accounts_company_id_idx on company_bank_accounts(company_id);
create index if not exists company_bank_accounts_user_id_idx on company_bank_accounts(user_id);

create unique index if not exists company_bank_accounts_one_default_per_currency_idx
  on company_bank_accounts (company_id, iban_currency)
  where is_default = true;

alter table company_contacts enable row level security;
alter table company_addresses enable row level security;
alter table company_bank_accounts enable row level security;

drop policy if exists company_contacts_access on company_contacts;
create policy company_contacts_access on company_contacts
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

drop policy if exists company_addresses_access on company_addresses;
create policy company_addresses_access on company_addresses
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

drop policy if exists company_bank_accounts_access on company_bank_accounts;
create policy company_bank_accounts_access on company_bank_accounts
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

grant select, insert, update, delete on table company_contacts to authenticated, service_role;
grant select, insert, update, delete on table company_addresses to authenticated, service_role;
grant select, insert, update, delete on table company_bank_accounts to authenticated, service_role;

insert into company_addresses (
  company_id, user_id, address_type,
  address, city, county, county_code, postal_code, country,
  is_default, sort_order
)
select
  c.id,
  c.user_id,
  'sediu_social',
  coalesce(c.address, ''),
  coalesce(c.city, ''),
  coalesce(c.county, ''),
  coalesce(c.county_code, ''),
  coalesce(c.postal_code, ''),
  coalesce(nullif(c.country, ''), 'RO'),
  true,
  0
from companies c
where coalesce(c.address, '') <> ''
  and not exists (
    select 1 from company_addresses a where a.company_id = c.id
  );

insert into company_bank_accounts (
  company_id, user_id, bank_name, iban, bic, iban_currency, is_default, sort_order
)
select
  c.id,
  c.user_id,
  coalesce(c.bank_name, ''),
  coalesce(c.iban, ''),
  coalesce(c.bic, ''),
  case when coalesce(c.iban_currency, '') = 'EUR' then 'EUR' else 'LEI' end,
  true,
  0
from companies c
where coalesce(c.iban, '') <> ''
  and not exists (
    select 1 from company_bank_accounts b where b.company_id = c.id
  );

insert into company_contacts (
  company_id, user_id, name, phone, contact_role, sort_order
)
select
  c.id,
  c.user_id,
  coalesce(c.contact_person, ''),
  coalesce(c.phone, ''),
  coalesce(c.contact_role, ''),
  0
from companies c
where coalesce(c.contact_person, '') <> ''
  and not exists (
    select 1 from company_contacts p where p.company_id = c.id
  );
