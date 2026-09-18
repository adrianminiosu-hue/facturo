-- Purchase invoices registered from e-Factura SPV (received documents).
-- Issued invoices stay direction = 'issued' and keep appearing in Facturi emise.

alter table invoices
  add column if not exists direction text default 'issued';

update invoices
set direction = 'issued'
where direction is null or direction = '';

create index if not exists invoices_company_direction_idx
  on invoices (company_id, direction);

create unique index if not exists invoices_purchase_company_number_uidx
  on invoices (company_id, series, invoice_number)
  where direction = 'purchase' and company_id is not null;
