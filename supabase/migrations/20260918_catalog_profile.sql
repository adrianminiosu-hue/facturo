-- Share nomenclator articole across all companies of the same owner profile.
-- Keep one row per (user_id, name), then store it with company_id null.

delete from catalog_items c
where c.id not in (
  select id from (
    select
      id,
      row_number() over (
        partition by user_id, lower(btrim(name))
        order by
          (company_id is null) desc,
          last_used_at desc nulls last,
          updated_at desc,
          created_at desc,
          id
      ) as rn
    from catalog_items
  ) keep
  where rn = 1
);

update catalog_items
set company_id = null,
    updated_at = now()
where company_id is not null;

-- After promotion, duplicate codes would violate catalog_items_user_code_idx.
update catalog_items c
set code = ''
where btrim(c.code) <> ''
  and exists (
    select 1
    from catalog_items o
    where o.user_id = c.user_id
      and o.id <> c.id
      and o.company_id is null
      and lower(btrim(o.code)) = lower(btrim(c.code))
      and o.id < c.id
  );
