alter table invoices add column if not exists reminder_sent_at timestamptz;
alter table invoices add column if not exists promised_pay_date date;
alter table invoices add column if not exists amount_paid numeric default 0;

create table if not exists invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  paid_on date not null default current_date,
  method text not null default 'transfer',
  reference text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists invoice_payments_invoice_id_idx on invoice_payments(invoice_id);

alter table invoice_payments enable row level security;

drop policy if exists invoice_payments_own on invoice_payments;
create policy invoice_payments_own on invoice_payments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
