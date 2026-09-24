-- Applied after D4: no duplicate issued (company_id, series, invoice_number) non-draft rows.

create unique index if not exists invoices_issued_company_number_uidx
  on invoices (company_id, series, invoice_number)
  where direction is distinct from 'purchase'
    and status is distinct from 'draft';
