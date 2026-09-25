-- ANAF registry status per client, refreshed by /api/jobs/due-reminders and on the client page.
alter table clients
  add column if not exists anaf_checked_at timestamptz,
  add column if not exists anaf_inactive boolean,
  add column if not exists anaf_deregistered_on date,
  add column if not exists anaf_efactura_registered boolean,
  add column if not exists anaf_vat_on_collection boolean,
  add column if not exists anaf_split_vat boolean;
