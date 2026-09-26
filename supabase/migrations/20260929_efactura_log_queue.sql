-- 1) Journal of every e-Factura operation (validation, upload, status check, retry, SPV import),
--    so the transfer rate is a measured number, not an estimate.
create table if not exists efactura_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  direction text not null check (direction in ('out', 'in')),
  operation text not null check (operation in ('validate', 'upload', 'status', 'import')),
  outcome text not null check (outcome in ('ok', 'rejected', 'invalid', 'missing_data', 'processing', 'unavailable', 'error', 'skipped')),
  trigger text not null default 'user' check (trigger in ('user', 'job')),
  invoice_ref text,
  index_incarcare text,
  message_id text,
  attempt integer,
  code text,
  message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists efactura_log_user_created_idx on efactura_log (user_id, created_at desc);
create index if not exists efactura_log_invoice_idx on efactura_log (invoice_id) where invoice_id is not null;

-- Readable by the portfolio; written only by the server (service role).
alter table efactura_log enable row level security;
drop policy if exists efactura_log_read on efactura_log;
create policy efactura_log_read on efactura_log
  for select
  using (is_portfolio_member(user_id));
grant select on table efactura_log to authenticated;
grant select, insert, update, delete on table efactura_log to service_role;

-- 2) Retry queue: an invoice ANAF could not receive (outage, timeout, 5xx) waits with
--    efactura_status = 'queued' and is sent again automatically.
alter table invoices
  add column if not exists efactura_attempts integer not null default 0,
  add column if not exists efactura_next_attempt_at timestamptz,
  add column if not exists efactura_queued_at timestamptz;

create index if not exists invoices_efactura_pending_idx on invoices (efactura_status)
  where efactura_status in ('queued', 'uploaded', 'in_processing');
