-- ANAF OAuth tokens for e-Factura TEST (and later prod). Server-side only.

create table if not exists anaf_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  environment text not null default 'test',
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  cert_serial text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint anaf_oauth_tokens_env_check check (environment in ('test', 'prod'))
);

create unique index if not exists anaf_oauth_tokens_owner_env_idx
  on anaf_oauth_tokens (user_id, environment)
  where company_id is null;

create index if not exists anaf_oauth_tokens_user_idx on anaf_oauth_tokens(user_id);

alter table anaf_oauth_tokens enable row level security;

grant select, insert, update, delete on table anaf_oauth_tokens to authenticated, service_role;

do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'is_portfolio_member'
      and pg_function_is_visible(oid)
  ) then
    execute 'drop policy if exists anaf_oauth_tokens_access on anaf_oauth_tokens';
    execute $p$
      create policy anaf_oauth_tokens_access on anaf_oauth_tokens
        for all
        using (is_portfolio_member(user_id))
        with check (is_portfolio_member(user_id))
    $p$;
  end if;
end $$;

alter table invoices add column if not exists efactura_status text;
alter table invoices add column if not exists efactura_index text;
alter table invoices add column if not exists efactura_error text;
alter table invoices add column if not exists efactura_environment text;
alter table invoices add column if not exists efactura_uploaded_at timestamptz;
