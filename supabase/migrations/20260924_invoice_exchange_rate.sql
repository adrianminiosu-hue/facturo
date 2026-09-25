-- Optional EUR exchange rate on issued invoices. Unit prices stay as entered;
-- totals, PDF and e-Factura convert to RON by multiplying every line.

alter table invoices
  add column if not exists exchange_rate numeric,
  add column if not exists exchange_rate_source text,
  add column if not exists exchange_rate_date date;
