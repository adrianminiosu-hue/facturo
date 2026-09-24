-- Revert Phase 1 bank matching schema. Does not restore amount_paid values.

drop trigger if exists invoice_payments_after_change on invoice_payments;
drop trigger if exists invoice_payments_guard on invoice_payments;
drop function if exists invoice_payments_after_change();
drop function if exists invoice_payments_guard();
drop function if exists refresh_invoice_payment_state(uuid);
drop function if exists invoice_open_status(invoices);

alter table invoice_payments drop constraint if exists invoice_payments_bank_transaction_fkey;
alter table invoice_payments drop constraint if exists invoice_payments_company_user_fkey;
alter table invoice_payments drop constraint if exists invoice_payments_source_check;

alter table invoice_payments drop column if exists bank_transaction_id;
alter table invoice_payments drop column if exists match_confidence;
alter table invoice_payments drop column if exists match_rule;
alter table invoice_payments drop column if exists migrated_to_tx_at;

alter table invoices drop constraint if exists invoices_payment_status_check;
alter table invoices drop column if exists payment_status;

drop table if exists bank_match_rules;
drop table if exists bank_match_suggestions;
drop table if exists bank_transactions;
drop table if exists bank_accounts;
drop table if exists bank_connections;
drop table if exists bank_phase1_amount_paid_report;

drop index if exists companies_id_user_id_uidx;
