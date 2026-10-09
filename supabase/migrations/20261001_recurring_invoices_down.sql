drop index if exists invoices_recurring_occurrence_uidx;
alter table invoices
  drop column if exists recurring_occurrence_date,
  drop column if exists recurring_invoice_id;
drop table if exists recurring_invoices;
