-- Per-client automatic reminder schedule + a log of every reminder sent.
-- Clients without a settings row keep the legacy behaviour (one reminder 2 days before due).

create table if not exists client_reminder_settings (
  client_id uuid primary key references clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  enabled boolean not null default true,
  offsets integer[] not null default '{-3,1,7,15,30}',
  recipient_email text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table client_reminder_settings enable row level security;
drop policy if exists client_reminder_settings_access on client_reminder_settings;
create policy client_reminder_settings_access on client_reminder_settings
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));
grant select, insert, update, delete on table client_reminder_settings to authenticated, service_role;

create table if not exists invoice_reminder_log (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  offset_days integer,
  kind text not null default 'auto' check (kind in ('auto', 'manual')),
  recipient text,
  sent_at timestamptz not null default now()
);

create index if not exists invoice_reminder_log_invoice_idx on invoice_reminder_log (invoice_id);
create unique index if not exists invoice_reminder_log_auto_once
  on invoice_reminder_log (invoice_id, offset_days)
  where kind = 'auto';

-- Readable by the portfolio; written only by the server (service role).
alter table invoice_reminder_log enable row level security;
drop policy if exists invoice_reminder_log_read on invoice_reminder_log;
create policy invoice_reminder_log_read on invoice_reminder_log
  for select
  using (is_portfolio_member(user_id));
grant select on table invoice_reminder_log to authenticated;
grant select, insert, update, delete on table invoice_reminder_log to service_role;
