-- Allow "Transferată în SPV" on issued invoices.
-- Live DBs currently reject status=spv (invoices_status_check) and may lack efactura_* columns.

alter table invoices drop constraint if exists invoices_status_check;

alter table invoices add constraint invoices_status_check
  check (status in ('draft', 'sent', 'paid', 'overdue', 'spv'));

alter table invoices
  add column if not exists efactura_status text,
  add column if not exists efactura_index text,
  add column if not exists efactura_error text,
  add column if not exists efactura_environment text,
  add column if not exists efactura_uploaded_at timestamptz;
