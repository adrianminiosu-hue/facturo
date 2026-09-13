-- Extra fields required to generate RO_CIUS / UBL 2.1 e-Factura XML.

alter table profiles
  add column if not exists postal_code text,
  add column if not exists county_code text,
  add column if not exists country text default 'RO',
  add column if not exists vat_registered boolean default true,
  add column if not exists bic text;

alter table clients
  add column if not exists postal_code text,
  add column if not exists county_code text,
  add column if not exists country text default 'RO',
  add column if not exists vat_registered boolean default true;

alter table invoices
  add column if not exists invoice_type_code text default '380',
  add column if not exists currency text default 'RON',
  add column if not exists payment_means_code text default '42',
  add column if not exists tax_point_date date,
  add column if not exists delivery_date date,
  add column if not exists buyer_reference text,
  add column if not exists order_reference text,
  add column if not exists period_start date,
  add column if not exists period_end date;

alter table invoice_items
  add column if not exists unit_code text default 'H87',
  add column if not exists vat_category text default 'S',
  add column if not exists vat_exemption_reason text;
