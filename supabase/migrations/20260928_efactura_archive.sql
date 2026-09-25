-- Archive of the ANAF download (the ZIP with the invoice XML + ANAF signature = the legal original).
alter table invoices
  add column if not exists efactura_zip_path text,
  add column if not exists efactura_signature jsonb;

-- Private bucket for the archives; only the server (service role) reads and writes it.
insert into storage.buckets (id, name, public)
values ('efactura', 'efactura', false)
on conflict (id) do nothing;

create index if not exists invoices_efactura_index_idx on invoices (efactura_index) where efactura_index is not null;
