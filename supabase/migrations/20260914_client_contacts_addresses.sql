-- Multiple contact persons and addresses per client.
-- Legacy clients.address / city / county / county_code / postal_code / country
-- stay in sync with the single default address (e-Factura + PDF).

create table if not exists client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  contact_role text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists client_contacts_client_id_idx on client_contacts(client_id);
create index if not exists client_contacts_company_id_idx on client_contacts(company_id);
create index if not exists client_contacts_user_id_idx on client_contacts(user_id);

create table if not exists client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  address_type text not null default 'sediu_social',
  address text not null default '',
  city text not null default '',
  county text not null default '',
  county_code text not null default '',
  postal_code text not null default '',
  country text not null default 'RO',
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists client_addresses_client_id_idx on client_addresses(client_id);
create index if not exists client_addresses_company_id_idx on client_addresses(company_id);
create index if not exists client_addresses_user_id_idx on client_addresses(user_id);

create unique index if not exists client_addresses_one_default_idx
  on client_addresses (client_id)
  where is_default = true;

alter table client_contacts enable row level security;
alter table client_addresses enable row level security;

drop policy if exists client_contacts_own on client_contacts;
create policy client_contacts_own on client_contacts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists client_addresses_own on client_addresses;
create policy client_addresses_own on client_addresses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table client_contacts to authenticated, service_role;
grant select, insert, update, delete on table client_addresses to authenticated, service_role;

create or replace function client_addresses_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update client_addresses
    set is_default = false
    where client_id = new.client_id
      and id is distinct from new.id
      and is_default = true;
  elsif TG_OP = 'INSERT' and not exists (
    select 1
    from client_addresses
    where client_id = new.client_id
      and is_default = true
  ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

drop trigger if exists client_addresses_before_write on client_addresses;
create trigger client_addresses_before_write
  before insert or update of is_default
  on client_addresses
  for each row
  execute procedure client_addresses_before_write();

create or replace function client_addresses_sync_client()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update clients
    set
      address = new.address,
      city = new.city,
      county = new.county,
      county_code = new.county_code,
      postal_code = new.postal_code,
      country = coalesce(nullif(new.country, ''), 'RO')
    where id = new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists client_addresses_sync_client on client_addresses;
create trigger client_addresses_sync_client
  after insert or update of is_default, address, city, county, county_code, postal_code, country
  on client_addresses
  for each row
  execute procedure client_addresses_sync_client();

create or replace function client_addresses_after_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_default then
    update client_addresses
    set is_default = true
    where id = (
      select id
      from client_addresses
      where client_id = old.client_id
      order by sort_order, created_at
      limit 1
    );
  end if;
  return old;
end;
$$;

drop trigger if exists client_addresses_after_delete on client_addresses;
create trigger client_addresses_after_delete
  after delete
  on client_addresses
  for each row
  execute procedure client_addresses_after_delete();

insert into client_addresses (
  client_id, user_id, company_id, address_type,
  address, city, county, county_code, postal_code, country,
  is_default, sort_order
)
select
  c.id,
  c.user_id,
  c.company_id,
  'sediu_social',
  coalesce(c.address, ''),
  coalesce(c.city, ''),
  coalesce(c.county, ''),
  coalesce(c.county_code, ''),
  coalesce(c.postal_code, ''),
  coalesce(nullif(c.country, ''), 'RO'),
  true,
  0
from clients c
where not exists (
  select 1 from client_addresses a where a.client_id = c.id
);
