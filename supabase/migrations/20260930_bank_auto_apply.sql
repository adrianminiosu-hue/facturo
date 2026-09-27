-- Per company: book sure bank matches (confidence >= 90: exact invoice reference, known IBAN + exact amount,
-- unique invoice combination from a known IBAN) at statement import, without a click.
-- Off by default: every match waits for confirmation until the owner turns it on (Bancă page).
alter table companies
  add column if not exists bank_auto_apply boolean not null default false;
