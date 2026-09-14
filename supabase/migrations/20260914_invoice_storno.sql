-- Link a credit note (storno) to the original issued invoice.

alter table invoices
  add column if not exists credited_invoice_id uuid references invoices(id);

create index if not exists invoices_credited_invoice_id_idx
  on invoices (credited_invoice_id);
