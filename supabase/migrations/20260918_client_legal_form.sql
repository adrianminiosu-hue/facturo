-- ANAF / SAF-T / CRC legal form (nomenclatorul formelor juridice) on clients.

alter table clients
  add column if not exists legal_form text not null default '';
