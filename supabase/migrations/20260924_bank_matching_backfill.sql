-- Idempotent backfill: xml940 payments → bank_transactions.
-- Does not overwrite invoices.amount_paid. Diffs go to bank_phase1_amount_paid_report.

create table if not exists bank_phase1_amount_paid_report (
  invoice_id uuid primary key references invoices(id) on delete cascade,
  stored_amount_paid numeric,
  recomputed_amount_paid numeric,
  reported_at timestamptz not null default now()
);

update invoice_payments p
set company_id = i.company_id
from invoices i
where p.invoice_id = i.id
  and p.company_id is null
  and i.company_id is not null;

insert into bank_transactions (
  user_id,
  company_id,
  created_by,
  source,
  provider_tx_id,
  fingerprint,
  booking_date,
  amount,
  currency,
  counterparty_name,
  counterparty_iban,
  description,
  match_status
)
select
  p.user_id,
  p.company_id,
  p.created_by,
  'xml940',
  p.bank_txn_id,
  p.fingerprint,
  p.paid_on,
  p.amount,
  'RON',
  p.counterpart_name,
  p.counterpart_iban,
  p.notes,
  case when p.invoice_id is null then 'unmatched' else 'matched' end
from invoice_payments p
where p.source = 'xml940'
  and p.fingerprint is not null
  and p.company_id is not null
  and not exists (
    select 1
    from bank_transactions t
    where t.company_id = p.company_id
      and t.fingerprint = p.fingerprint
  );

update invoice_payments p
set bank_transaction_id = t.id
from bank_transactions t
where p.source = 'xml940'
  and p.fingerprint is not null
  and p.company_id = t.company_id
  and p.fingerprint = t.fingerprint
  and p.bank_transaction_id is null;

update invoice_payments p
set migrated_to_tx_at = coalesce(p.migrated_to_tx_at, now())
where p.source = 'xml940'
  and p.invoice_id is null
  and p.bank_transaction_id is not null;

insert into bank_phase1_amount_paid_report (
  invoice_id, stored_amount_paid, recomputed_amount_paid
)
select
  i.id,
  coalesce(i.amount_paid, 0),
  coalesce(s.paid, 0)
from invoices i
left join (
  select invoice_id, sum(amount) as paid
  from invoice_payments
  where invoice_id is not null
  group by invoice_id
) s on s.invoice_id = i.id
where coalesce(i.amount_paid, 0) is distinct from coalesce(s.paid, 0)
on conflict (invoice_id) do update
set stored_amount_paid = excluded.stored_amount_paid,
    recomputed_amount_paid = excluded.recomputed_amount_paid,
    reported_at = now();
