-- Undo the Finsquare IT Solutions test extras import only.
-- Does not delete older manual collections.
-- Paste into Supabase → SQL Editor → Run.

begin;

create temporary table test_tx on commit drop as
select t.id
from bank_transactions t
where t.company_id = '835e6b6d-dfd3-46e3-967d-935cbfc305f6'
  and t.source = 'camt053'
  and (
    coalesce(t.provider_tx_id, '') like 'INGREF%'
    or coalesce(t.provider_tx_id, '') like 'INGOPEN%'
    or coalesce(t.provider_tx_id, '') like 'ING2%'
    or coalesce(t.provider_tx_id, '') like 'INGFEE%'
    or coalesce(t.description, '') like 'Plata factura FCT%'
    or coalesce(t.description, '') like 'Comision administrare cont%'
  );

do $$
declare
  n_tx int;
begin
  select count(*) into n_tx from test_tx;
  raise notice 'Test extras transactions to remove: %', n_tx;
end $$;

-- Keep pre-existing collections; only detach them from the extras line.
update invoice_payments p
set
  bank_transaction_id = null,
  match_confidence = null,
  match_rule = null
where p.bank_transaction_id in (select id from test_tx)
  and (p.match_rule = 'already_collected' or p.source = 'manual');

-- Remove allocations created by the extras import.
delete from invoice_payments p
where p.bank_transaction_id in (select id from test_tx);

delete from bank_match_suggestions s
where s.bank_transaction_id in (select id from test_tx);

delete from bank_match_events e
where e.bank_transaction_id in (select id from test_tx)
   or (
     e.company_id = '835e6b6d-dfd3-46e3-967d-935cbfc305f6'
     and e.action = 'import'
     and coalesce(e.payload->>'fileName', '') ilike '%finsquare%test%extras%'
   );

delete from bank_transactions t
where t.id in (select id from test_tx);

-- Put amount_paid / payment_status back in sync with leftover payments.
do $$
declare
  r record;
begin
  for r in
    select i.id
    from invoices i
    where i.company_id = '835e6b6d-dfd3-46e3-967d-935cbfc305f6'
  loop
    perform refresh_invoice_payment_state(r.id);
  end loop;
end $$;

commit;
