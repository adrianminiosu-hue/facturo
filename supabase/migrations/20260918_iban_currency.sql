-- Account currency for client / company IBANs (LEI or EUR).

alter table clients
  add column if not exists iban_currency text not null default 'LEI';

alter table companies
  add column if not exists iban_currency text not null default 'LEI';

alter table profiles
  add column if not exists iban_currency text not null default 'LEI';
