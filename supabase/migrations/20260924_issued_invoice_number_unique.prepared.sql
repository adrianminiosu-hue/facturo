-- PREPARED ONLY. Do not apply until duplicate issued numbers are cleaned.
-- unique (company_id, series, invoice_number) for issued, non-draft invoices.

-- create unique index concurrently invoices_issued_company_number_uidx
--   on invoices (company_id, series, invoice_number)
--   where direction is distinct from 'purchase' and status is distinct from 'draft';
