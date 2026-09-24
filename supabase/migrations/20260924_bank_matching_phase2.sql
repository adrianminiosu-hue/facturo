-- Phase 2: CSV mapping, audit events. Reversible via 20260924_bank_matching_phase2_down.sql

alter table bank_accounts
  add column if not exists import_mapping jsonb;

create table if not exists bank_match_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid references auth.users(id),
  bank_transaction_id uuid references bank_transactions(id) on delete set null,
  action text not null,
  payload jsonb,
  created_at timestamptz default now(),
  constraint bank_match_events_action_check
    check (action in ('import', 'auto_apply', 'confirm', 'ignore', 'undo', 'reallocate')),
  constraint bank_match_events_company_user_fkey
    foreign key (company_id, user_id) references companies (id, user_id)
);

create index if not exists bank_match_events_tx_idx
  on bank_match_events (bank_transaction_id, created_at desc);

alter table bank_match_events enable row level security;

drop policy if exists bank_match_events_access on bank_match_events;
create policy bank_match_events_access on bank_match_events
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

grant select, insert, update, delete on table bank_match_events to authenticated, service_role;
