-- Multicash XML 940 payment import: extras metadata + unallocated receipts.

alter table invoice_payments
  alter column invoice_id drop not null;

alter table invoice_payments
  add column if not exists company_id uuid references companies(id) on delete cascade,
  add column if not exists source text not null default 'manual',
  add column if not exists bank_txn_id text,
  add column if not exists counterpart_iban text,
  add column if not exists counterpart_name text,
  add column if not exists fingerprint text;

update invoice_payments p
set company_id = i.company_id
from invoices i
where p.invoice_id = i.id
  and p.company_id is null;

create index if not exists invoice_payments_company_id_idx
  on invoice_payments (company_id);

create index if not exists invoice_payments_source_idx
  on invoice_payments (user_id, source);

create unique index if not exists invoice_payments_user_fingerprint_uidx
  on invoice_payments (user_id, fingerprint)
  where fingerprint is not null;
