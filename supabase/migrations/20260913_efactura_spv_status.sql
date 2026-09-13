alter table invoices
  add column if not exists efactura_status text,
  add column if not exists efactura_index text,
  add column if not exists efactura_error text,
  add column if not exists efactura_environment text,
  add column if not exists efactura_uploaded_at timestamptz;
