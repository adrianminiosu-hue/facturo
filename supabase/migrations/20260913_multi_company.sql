-- Multi-company workspace: one accountant (auth user) owns many companies.
-- Clients and invoices belong to a company.

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text,
  cui text,
  reg_com text,
  address text,
  city text,
  county text,
  county_code text,
  postal_code text,
  country text default 'RO',
  vat_registered boolean default true,
  bank_name text,
  iban text,
  bic text,
  contact_person text,
  contact_role text,
  email text,
  phone text,
  invoice_series text default 'FCT',
  invoice_start_number integer default 1,
  created_at timestamptz default now()
);

create index if not exists companies_user_id_idx on companies(user_id);

alter table companies enable row level security;

drop policy if exists companies_own on companies;
create policy companies_own on companies
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into companies (
  user_id, company_name, cui, reg_com, address, city, county, county_code,
  postal_code, country, vat_registered, bank_name, iban, bic, contact_person,
  contact_role, email, phone, invoice_series, invoice_start_number
)
select
  p.id, p.company_name, p.cui, p.reg_com, p.address, p.city, p.county, p.county_code,
  p.postal_code, coalesce(p.country, 'RO'), coalesce(p.vat_registered, true),
  p.bank_name, p.iban, p.bic, p.contact_person, p.contact_role, p.email, p.phone,
  coalesce(p.invoice_series, 'FCT'), coalesce(p.invoice_start_number, 1)
from profiles p
where coalesce(p.company_name, '') <> ''
  and not exists (select 1 from companies c where c.user_id = p.id);

alter table clients add column if not exists company_id uuid references companies(id) on delete cascade;
alter table invoices add column if not exists company_id uuid references companies(id) on delete cascade;

create index if not exists clients_company_id_idx on clients(company_id);
create index if not exists invoices_company_id_idx on invoices(company_id);

update clients cl
set company_id = c.id
from companies c
where cl.company_id is null
  and c.user_id = cl.user_id
  and c.id = (
    select c2.id from companies c2
    where c2.user_id = cl.user_id
    order by c2.created_at
    limit 1
  );

update invoices inv
set company_id = c.id
from companies c
where inv.company_id is null
  and c.user_id = inv.user_id
  and c.id = (
    select c2.id from companies c2
    where c2.user_id = inv.user_id
    order by c2.created_at
    limit 1
  );
