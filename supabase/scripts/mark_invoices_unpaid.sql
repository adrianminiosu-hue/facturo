-- One-off: reopen all paid invoices so they appear on Încasări.
-- Paste into Supabase → SQL Editor → Run.
-- Drafts are left untouched.

update invoices
set
  status = case
    when due_date is not null and due_date < current_date then 'overdue'
    else 'sent'
  end,
  amount_paid = 0
where status = 'paid';
