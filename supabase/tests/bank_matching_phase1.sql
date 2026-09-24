-- Phase 1 diagnostics + disposable-DB checks.
-- Read-only queries are safe on production. The integration block at the bottom
-- must run only against a disposable database (it inserts/deletes fixture rows).

-- D4: duplicate issued numbers (non-draft)
select company_id, series, invoice_number, count(*) as copies, array_agg(id) as invoice_ids
from invoices
where coalesce(direction, 'issued') is distinct from 'purchase'
  and coalesce(status, '') is distinct from 'draft'
group by company_id, series, invoice_number
having count(*) > 1
order by copies desc;

-- Backfill report: stored amount_paid vs sum(invoice_payments.amount)
select * from bank_phase1_amount_paid_report
order by reported_at desc;

-- D2 pre-check: payments whose company_id does not belong to user_id
select p.id, p.user_id, p.company_id, c.user_id as company_owner
from invoice_payments p
left join companies c on c.id = p.company_id
where p.company_id is not null
  and (c.id is null or c.user_id is distinct from p.user_id);

-- Backfill idempotency: one bank_transactions row per (company_id, fingerprint)
select company_id, fingerprint, count(*) as copies
from bank_transactions
group by company_id, fingerprint
having count(*) > 1;

-- ---------------------------------------------------------------------------
-- Integration (disposable DB only). Requires two auth users + one company.
-- Set the session GUCs before running, then:
--   select set_config('test.owner', '<titular uuid>', false);
--   select set_config('test.other', '<other titular uuid>', false);
--   select set_config('test.company', '<company uuid owned by titular>', false);
-- ---------------------------------------------------------------------------
-- Trigger recompute / undo / overpayment / composite FK / RLS:
--
-- 1. Insert an issued invoice for test.company / test.owner (status sent, total 100).
-- 2. Insert invoice_payments amount 100 → invoices.amount_paid = 100, payment_status = paid, status = paid.
-- 3. Delete that payment → amount_paid = 0, payment_status = unpaid, status restored via invoice_open_status
--    (spv if efactura uploaded / [[FACTURO_SPV]], else overdue if due_date < current_date, else sent). Draft untouched.
-- 4. Insert amount 100.02 → rejected (allocation exceeds invoice remaining).
-- 5. Insert invoice_payments with company_id of test.company and user_id of test.other → rejected
--    (company/user mismatch / composite FK).
-- 6. As test.other, select from bank_transactions of test.owner → 0 rows (RLS).
-- 7. Run 20260924_bank_matching_backfill.sql twice → bank_transactions count unchanged.
