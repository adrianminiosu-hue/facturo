-- Revert Phase 2 extras. Does not restore deleted unallocated invoice_payments.

drop table if exists bank_match_events;
alter table bank_accounts drop column if exists import_mapping;
drop index if exists invoices_issued_company_number_uidx;
