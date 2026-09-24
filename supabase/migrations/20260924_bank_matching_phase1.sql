-- Phase 1 bank matching: ledger tables, allocation FK, payment_status trigger.
-- Reversible via 20260924_bank_matching_phase1_down.sql

create unique index if not exists companies_id_user_id_uidx
  on companies (id, user_id);

alter table invoice_payments
  add column if not exists bank_transaction_id uuid,
  add column if not exists match_confidence integer,
  add column if not exists match_rule text,
  add column if not exists migrated_to_tx_at timestamptz;

do $$
declare
  mismatch_count integer;
begin
  select count(*) into mismatch_count
  from invoice_payments p
  where p.company_id is not null
    and not exists (
      select 1 from companies c
      where c.id = p.company_id and c.user_id = p.user_id
    );
  if mismatch_count > 0 then
    raise exception
      'invoice_payments has % row(s) where company_id does not belong to user_id. Inspect those rows before adding invoice_payments_company_user_fkey.',
      mismatch_count;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoice_payments_company_user_fkey'
  ) then
    alter table invoice_payments
      add constraint invoice_payments_company_user_fkey
      foreign key (company_id, user_id) references companies (id, user_id);
  end if;
end $$;

alter table invoice_payments drop constraint if exists invoice_payments_source_check;
alter table invoice_payments
  add constraint invoice_payments_source_check
  check (source in ('manual', 'xml940', 'bank_api', 'camt053', 'csv'));

create table if not exists bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid references auth.users(id),
  provider text not null,
  provider_connection_ref text,
  bank_code text,
  bank_name text,
  status text not null default 'pending',
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  constraint bank_connections_provider_check
    check (provider in ('mock', 'finqware', 'smartfintech')),
  constraint bank_connections_status_check
    check (status in ('pending', 'active', 'expiring', 'expired', 'revoked', 'error')),
  constraint bank_connections_company_user_fkey
    foreign key (company_id, user_id) references companies (id, user_id)
);

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid references auth.users(id),
  connection_id uuid references bank_connections(id) on delete set null,
  iban text not null,
  currency text not null default 'RON',
  account_name text,
  balance numeric,
  balance_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  constraint bank_accounts_company_iban_currency_uidx unique (company_id, iban, currency),
  constraint bank_accounts_company_user_fkey
    foreign key (company_id, user_id) references companies (id, user_id)
);

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid references auth.users(id),
  bank_account_id uuid references bank_accounts(id) on delete set null,
  source text not null,
  provider_tx_id text,
  fingerprint text not null,
  booking_date date not null,
  value_date date,
  amount numeric(14, 2) not null,
  currency text not null default 'RON',
  counterparty_name text,
  counterparty_iban text,
  description text,
  match_status text not null default 'unmatched',
  ignored_reason text,
  created_at timestamptz default now(),
  constraint bank_transactions_source_check
    check (source in ('xml940', 'camt053', 'csv', 'api')),
  constraint bank_transactions_match_status_check
    check (match_status in ('unmatched', 'suggested', 'matched', 'partially_matched', 'ignored')),
  constraint bank_transactions_company_fingerprint_uidx unique (company_id, fingerprint),
  constraint bank_transactions_company_user_fkey
    foreign key (company_id, user_id) references companies (id, user_id)
);

create index if not exists bank_transactions_company_status_idx
  on bank_transactions (company_id, match_status);

create table if not exists bank_match_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid references auth.users(id),
  bank_transaction_id uuid not null references bank_transactions(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(14, 2) not null,
  confidence integer not null,
  rule text not null,
  created_at timestamptz default now(),
  constraint bank_match_suggestions_company_user_fkey
    foreign key (company_id, user_id) references companies (id, user_id)
);

create index if not exists bank_match_suggestions_tx_idx
  on bank_match_suggestions (bank_transaction_id);

create table if not exists bank_match_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid references auth.users(id),
  counterparty_iban text,
  counterparty_name_norm text,
  client_id uuid not null references clients(id) on delete cascade,
  created_from_payment_id uuid references invoice_payments(id) on delete set null,
  created_at timestamptz default now(),
  constraint bank_match_rules_company_user_fkey
    foreign key (company_id, user_id) references companies (id, user_id)
);

create index if not exists bank_match_rules_company_iban_idx
  on bank_match_rules (company_id, counterparty_iban);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoice_payments_bank_transaction_fkey'
  ) then
    alter table invoice_payments
      add constraint invoice_payments_bank_transaction_fkey
      foreign key (bank_transaction_id) references bank_transactions(id) on delete restrict;
  end if;
end $$;

alter table invoices
  add column if not exists payment_status text;

update invoices
set payment_status = case
  when coalesce(total, 0) - coalesce(prepaid_amount, 0) - coalesce(amount_paid, 0) <= 0.01 then 'paid'
  when coalesce(amount_paid, 0) > 0 then 'partial'
  else 'unpaid'
end
where payment_status is null;

alter table invoices
  alter column payment_status set default 'unpaid';

alter table invoices drop constraint if exists invoices_payment_status_check;
alter table invoices
  add constraint invoices_payment_status_check
  check (payment_status in ('unpaid', 'partial', 'paid'));

create or replace function invoice_open_status(inv invoices)
returns text
language plpgsql
stable
as $$
begin
  if coalesce(inv.status, '') = 'draft' or inv.status is null then
    return 'draft';
  end if;
  if coalesce(inv.efactura_status, '') in ('uploaded', 'in_processing', 'accepted')
     or coalesce(inv.notes, '') like '%[[FACTURO_SPV]]%' then
    return 'spv';
  end if;
  if inv.due_date is not null and inv.due_date < current_date then
    return 'overdue';
  end if;
  return 'sent';
end;
$$;

create or replace function refresh_invoice_payment_state(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  inv invoices%rowtype;
  paid numeric;
  remaining numeric;
  next_payment_status text;
begin
  if p_invoice_id is null then
    return;
  end if;

  select * into inv from invoices where id = p_invoice_id for update;
  if not found then
    return;
  end if;

  select coalesce(sum(amount), 0) into paid
  from invoice_payments
  where invoice_id = p_invoice_id;

  remaining := coalesce(inv.total, 0) - coalesce(inv.prepaid_amount, 0) - paid;

  if remaining <= 0.01 then
    next_payment_status := 'paid';
  elsif paid > 0 then
    next_payment_status := 'partial';
  else
    next_payment_status := 'unpaid';
  end if;

  if coalesce(inv.status, '') = 'draft' then
    update invoices
    set amount_paid = paid,
        payment_status = next_payment_status
    where id = p_invoice_id;
    return;
  end if;

  update invoices
  set amount_paid = paid,
      payment_status = next_payment_status,
      status = case
        when next_payment_status = 'paid' then 'paid'
        else invoice_open_status(inv)
      end
  where id = p_invoice_id;
end;
$$;

create or replace function invoice_payments_guard()
returns trigger
language plpgsql
as $$
declare
  inv invoices%rowtype;
  paid numeric;
  remaining numeric;
  tx_abs numeric;
  alloc numeric;
begin
  if NEW.company_id is not null and not exists (
    select 1 from companies c
    where c.id = NEW.company_id and c.user_id = NEW.user_id
  ) then
    raise exception 'invoice_payments company/user mismatch';
  end if;

  if NEW.invoice_id is not null then
    select * into inv from invoices where id = NEW.invoice_id;
    if not found then
      raise exception 'invoice not found';
    end if;
    select coalesce(sum(amount), 0) into paid
    from invoice_payments
    where invoice_id = NEW.invoice_id
      and (TG_OP = 'INSERT' or id is distinct from NEW.id);
    remaining := coalesce(inv.total, 0) - coalesce(inv.prepaid_amount, 0) - paid - NEW.amount;
    if remaining < -0.01 then
      raise exception 'allocation exceeds invoice remaining';
    end if;
  end if;

  if NEW.bank_transaction_id is not null then
    select abs(amount) into tx_abs from bank_transactions where id = NEW.bank_transaction_id;
    select coalesce(sum(amount), 0) into alloc
    from invoice_payments
    where bank_transaction_id = NEW.bank_transaction_id
      and (TG_OP = 'INSERT' or id is distinct from NEW.id);
    if alloc + NEW.amount > coalesce(tx_abs, 0) + 0.01 then
      raise exception 'allocations exceed transaction amount';
    end if;
  end if;

  return NEW;
end;
$$;

create or replace function invoice_payments_after_change()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    perform refresh_invoice_payment_state(OLD.invoice_id);
    return OLD;
  end if;
  if TG_OP = 'UPDATE' and OLD.invoice_id is distinct from NEW.invoice_id then
    perform refresh_invoice_payment_state(OLD.invoice_id);
  end if;
  perform refresh_invoice_payment_state(NEW.invoice_id);
  return NEW;
end;
$$;

drop trigger if exists invoice_payments_guard on invoice_payments;
create trigger invoice_payments_guard
  before insert or update of invoice_id, amount, company_id, user_id, bank_transaction_id
  on invoice_payments
  for each row
  execute procedure invoice_payments_guard();

drop trigger if exists invoice_payments_after_change on invoice_payments;
create trigger invoice_payments_after_change
  after insert or update of invoice_id, amount or delete
  on invoice_payments
  for each row
  execute procedure invoice_payments_after_change();

alter table bank_connections enable row level security;
alter table bank_accounts enable row level security;
alter table bank_transactions enable row level security;
alter table bank_match_suggestions enable row level security;
alter table bank_match_rules enable row level security;

drop policy if exists bank_connections_select on bank_connections;
create policy bank_connections_select on bank_connections
  for select using (is_portfolio_member(user_id));

drop policy if exists bank_connections_write on bank_connections;
create policy bank_connections_write on bank_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists bank_accounts_access on bank_accounts;
create policy bank_accounts_access on bank_accounts
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

drop policy if exists bank_transactions_access on bank_transactions;
create policy bank_transactions_access on bank_transactions
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

drop policy if exists bank_match_suggestions_access on bank_match_suggestions;
create policy bank_match_suggestions_access on bank_match_suggestions
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

drop policy if exists bank_match_rules_access on bank_match_rules;
create policy bank_match_rules_access on bank_match_rules
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

grant select, insert, update, delete on table bank_connections to authenticated, service_role;
grant select, insert, update, delete on table bank_accounts to authenticated, service_role;
grant select, insert, update, delete on table bank_transactions to authenticated, service_role;
grant select, insert, update, delete on table bank_match_suggestions to authenticated, service_role;
grant select, insert, update, delete on table bank_match_rules to authenticated, service_role;
