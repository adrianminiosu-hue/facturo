-- Multiple bank accounts per client (LEI and EUR).
-- One implicit account per currency. Legacy clients.bank_name / iban / bic / iban_currency
-- stay in sync with the LEI implicit account (or EUR if no LEI).

alter table clients
  add column if not exists iban_currency text not null default 'LEI';

create table if not exists client_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  bank_name text not null default '',
  iban text not null default '',
  bic text not null default '',
  iban_currency text not null default 'LEI',
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  constraint client_bank_accounts_currency_check check (iban_currency in ('LEI', 'EUR'))
);

create index if not exists client_bank_accounts_client_id_idx on client_bank_accounts(client_id);
create index if not exists client_bank_accounts_company_id_idx on client_bank_accounts(company_id);
create index if not exists client_bank_accounts_user_id_idx on client_bank_accounts(user_id);

create unique index if not exists client_bank_accounts_one_default_per_currency_idx
  on client_bank_accounts (client_id, iban_currency)
  where is_default = true;

alter table client_bank_accounts enable row level security;

drop policy if exists client_bank_accounts_access on client_bank_accounts;
create policy client_bank_accounts_access on client_bank_accounts
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

grant select, insert, update, delete on table client_bank_accounts to authenticated, service_role;

insert into client_bank_accounts (
  client_id, user_id, company_id, bank_name, iban, bic, iban_currency, is_default, sort_order
)
select
  c.id,
  c.user_id,
  c.company_id,
  coalesce(c.bank_name, ''),
  coalesce(c.iban, ''),
  coalesce(c.bic, ''),
  case when coalesce(c.iban_currency, '') = 'EUR' then 'EUR' else 'LEI' end,
  true,
  0
from clients c
where coalesce(c.iban, '') <> ''
  and not exists (
    select 1 from client_bank_accounts b where b.client_id = c.id
  );
