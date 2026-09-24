-- Delete backfilled unallocated invoice_payments after Încasări reads bank_transactions.
-- Aborts if any migrated row is not linked to a bank_transactions row.

do $$
declare
  orphan_count integer;
begin
  select count(*) into orphan_count
  from invoice_payments
  where invoice_id is null
    and migrated_to_tx_at is not null
    and bank_transaction_id is null;
  if orphan_count > 0 then
    raise exception
      'Refusing cleanup: % migrated invoice_payments row(s) have no bank_transaction_id.',
      orphan_count;
  end if;
end $$;

delete from invoice_payments
where invoice_id is null
  and migrated_to_tx_at is not null
  and bank_transaction_id is not null;
