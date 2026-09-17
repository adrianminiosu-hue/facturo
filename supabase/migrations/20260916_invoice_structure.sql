-- Invoice structure: 2026 VAT practice, discounts, avans, B2G, party freeze, TVA la încasare.

alter table companies
  add column if not exists vat_on_collection boolean default false;

alter table profiles
  add column if not exists vat_on_collection boolean default false;

alter table clients
  add column if not exists is_public_institution boolean default false;

alter table invoices
  add column if not exists discount_percent numeric default 0,
  add column if not exists discount_amount numeric default 0,
  add column if not exists prepaid_amount numeric default 0,
  add column if not exists seller_snapshot jsonb,
  add column if not exists buyer_snapshot jsonb;

alter table invoice_items
  add column if not exists discount_percent numeric default 0,
  add column if not exists discount_amount numeric default 0;
