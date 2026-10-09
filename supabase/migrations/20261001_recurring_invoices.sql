-- Recurring invoices: a template (lines, series, notes, payment terms) plus a schedule.
-- On each scheduled date the daily job creates a DRAFT (no number: the number is allocated at issue)
-- and the owner issues it with one click.

create table if not exists recurring_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  source_invoice_id uuid references invoices(id) on delete set null,
  frequency text not null check (frequency in ('monthly', 'quarterly', 'yearly')),
  -- Day of the month it is issued on; 29–31 fall on the last day of shorter months.
  anchor_day smallint not null check (anchor_day between 1 and 31),
  -- Date of occurrence 0 (the first invoice); occurrence k = start month + k × step, on anchor_day.
  start_date date not null,
  next_index integer not null default 1 check (next_index >= 0),
  next_run_date date,
  end_mode text not null default 'never' check (end_mode in ('never', 'count', 'until')),
  end_count integer check (end_count is null or end_count > 0),
  end_date date,
  -- Invoices in the series so far, the first one included.
  generated_count integer not null default 1 check (generated_count >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  pause_reason text,
  paused_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  template jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_invoices_end_check check (
    (end_mode = 'never')
    or (end_mode = 'count' and end_count is not null)
    or (end_mode = 'until' and end_date is not null)
  )
);

create index if not exists recurring_invoices_due_idx on recurring_invoices (status, next_run_date);
create index if not exists recurring_invoices_company_idx on recurring_invoices (company_id);
create index if not exists recurring_invoices_client_idx on recurring_invoices (client_id);

alter table recurring_invoices enable row level security;
drop policy if exists recurring_invoices_access on recurring_invoices;
create policy recurring_invoices_access on recurring_invoices
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));
grant select, insert, update, delete on table recurring_invoices to authenticated;
grant select, insert, update, delete on table recurring_invoices to service_role;

-- Which recurrence (and which scheduled date) an invoice came from.
alter table invoices
  add column if not exists recurring_invoice_id uuid references recurring_invoices(id) on delete set null,
  add column if not exists recurring_occurrence_date date;

-- One invoice per scheduled date: a retried or doubled job cannot create the same draft twice.
create unique index if not exists invoices_recurring_occurrence_uidx
  on invoices (recurring_invoice_id, recurring_occurrence_date)
  where recurring_invoice_id is not null;
