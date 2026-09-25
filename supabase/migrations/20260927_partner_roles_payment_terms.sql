-- Partners can be customers, suppliers or both; default payment term per customer.
alter table clients
  add column if not exists is_customer boolean not null default true,
  add column if not exists is_supplier boolean not null default false,
  add column if not exists payment_terms_days integer
    check (payment_terms_days is null or (payment_terms_days >= 0 and payment_terms_days <= 365));

-- Backfill: partners on purchase invoices are suppliers; those never invoiced by us are not customers.
update clients c
set is_supplier = true
where exists (
  select 1 from invoices i
  where i.client_id = c.id
    and (i.direction = 'purchase' or coalesce(i.notes, '') like '%[[FACTURO_PURCHASE]]%')
);

update clients c
set is_customer = false
where c.is_supplier
  and not exists (
    select 1 from invoices i
    where i.client_id = c.id
      and coalesce(i.direction, 'issued') <> 'purchase'
      and coalesce(i.notes, '') not like '%[[FACTURO_PURCHASE]]%'
  );
