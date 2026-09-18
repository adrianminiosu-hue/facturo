-- Cabinet seats: one titular owns many firms; operators inherit that portfolio.

create table if not exists portfolio_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'operator',
  status text not null default 'pending',
  invite_token text not null default gen_random_uuid()::text,
  created_at timestamptz default now(),
  accepted_at timestamptz,
  constraint portfolio_members_role_check check (role in ('operator')),
  constraint portfolio_members_status_check check (status in ('pending', 'active'))
);

create unique index if not exists portfolio_members_token_idx
  on portfolio_members (invite_token);

create unique index if not exists portfolio_members_owner_email_idx
  on portfolio_members (owner_user_id, lower(email));

create index if not exists portfolio_members_member_idx
  on portfolio_members (member_user_id)
  where member_user_id is not null;

create index if not exists portfolio_members_owner_idx
  on portfolio_members (owner_user_id);

alter table portfolio_members enable row level security;

create or replace function is_portfolio_member(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    owner is not null
    and auth.uid() is not null
    and (
      auth.uid() = owner
      or exists (
        select 1
        from public.portfolio_members m
        where m.owner_user_id = owner
          and m.member_user_id = auth.uid()
          and m.status = 'active'
      )
    )
$$;

revoke all on function is_portfolio_member(uuid) from public;
grant execute on function is_portfolio_member(uuid) to authenticated, service_role;

drop policy if exists portfolio_members_own on portfolio_members;
create policy portfolio_members_own on portfolio_members
  for all
  using (
    auth.uid() = owner_user_id
    or auth.uid() = member_user_id
  )
  with check (
    auth.uid() = owner_user_id
    or auth.uid() = member_user_id
  );

grant select, insert, update, delete on table portfolio_members to authenticated, service_role;

drop policy if exists companies_own on companies;
drop policy if exists companies_select on companies;
drop policy if exists companies_insert on companies;
drop policy if exists companies_update on companies;
drop policy if exists companies_delete on companies;

create policy companies_select on companies
  for select
  using (is_portfolio_member(user_id));

create policy companies_insert on companies
  for insert
  with check (auth.uid() = user_id);

create policy companies_update on companies
  for update
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

create policy companies_delete on companies
  for delete
  using (auth.uid() = user_id);

do $$
begin
  if to_regclass('public.catalog_items') is not null then
    execute 'drop policy if exists catalog_items_own on catalog_items';
    execute 'drop policy if exists catalog_items_access on catalog_items';
    execute $p$
      create policy catalog_items_access on catalog_items
        for all
        using (is_portfolio_member(user_id))
        with check (is_portfolio_member(user_id))
    $p$;
    execute 'alter table catalog_items add column if not exists created_by uuid references auth.users(id)';
  end if;
end $$;

drop policy if exists invoice_payments_own on invoice_payments;
drop policy if exists invoice_payments_access on invoice_payments;
create policy invoice_payments_access on invoice_payments
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

drop policy if exists client_contacts_own on client_contacts;
drop policy if exists client_contacts_access on client_contacts;
create policy client_contacts_access on client_contacts
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

drop policy if exists client_addresses_own on client_addresses;
drop policy if exists client_addresses_access on client_addresses;
create policy client_addresses_access on client_addresses
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

alter table invoices enable row level security;
drop policy if exists invoices_own on invoices;
drop policy if exists invoices_access on invoices;
create policy invoices_access on invoices
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

alter table clients enable row level security;
drop policy if exists clients_own on clients;
drop policy if exists clients_access on clients;
create policy clients_access on clients
  for all
  using (is_portfolio_member(user_id))
  with check (is_portfolio_member(user_id));

alter table invoice_items enable row level security;
drop policy if exists invoice_items_own on invoice_items;
drop policy if exists invoice_items_access on invoice_items;
create policy invoice_items_access on invoice_items
  for all
  using (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and is_portfolio_member(i.user_id)
    )
  )
  with check (
    exists (
      select 1 from invoices i
      where i.id = invoice_items.invoice_id
        and is_portfolio_member(i.user_id)
    )
  );

alter table invoices add column if not exists created_by uuid references auth.users(id);
alter table clients add column if not exists created_by uuid references auth.users(id);
alter table invoice_payments add column if not exists created_by uuid references auth.users(id);

grant select, insert, update, delete on table invoices to authenticated, service_role;
grant select, insert, update, delete on table clients to authenticated, service_role;
grant select, insert, update, delete on table invoice_items to authenticated, service_role;
