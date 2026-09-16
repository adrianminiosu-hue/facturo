-- Persist client SWIFT/BIC next to IBAN (ISO 9362).
-- Companies/profiles already have bic from 20260913_efactura_fields / multi_company.

alter table clients
  add column if not exists bic text;
