import { newDraftKey } from '@/lib/clientDirectory'
import {
  normalizeBic,
  normalizeIbanCurrency,
  validateClientBankDetails,
  type IbanCurrency
} from '@/lib/roBanks'
import { normalizeIban } from '@/lib/iban'

export type ClientBankAccountDraft = {
  key: string
  id?: string
  bank_name: string
  iban: string
  bic: string
  iban_currency: IbanCurrency
  is_default: boolean
}

export type ClientBankAccountRow = {
  id: string
  bank_name?: string | null
  iban?: string | null
  bic?: string | null
  iban_currency?: string | null
  is_default?: boolean | null
  sort_order?: number | null
}

export function emptyClientBankAccount(currency: IbanCurrency = 'LEI', isDefault = false): ClientBankAccountDraft {
  return {
    key: newDraftKey(),
    bank_name: '',
    iban: '',
    bic: '',
    iban_currency: currency,
    is_default: isDefault
  }
}

export function firstClientBankAccount(): ClientBankAccountDraft {
  return emptyClientBankAccount('LEI', true)
}

export function isBankAccountComplete(account?: ClientBankAccountDraft | null) {
  if (!account) return false
  return !!(account.bank_name.trim() && normalizeIban(account.iban))
}

export function isBankAccountValid(account: ClientBankAccountDraft) {
  return validateClientBankDetails(account)
}

export function banksFromClient(client: {
  bank_name?: string | null
  iban?: string | null
  bic?: string | null
  iban_currency?: string | null
  client_bank_accounts?: ClientBankAccountRow[] | null
}): ClientBankAccountDraft[] {
  if (client.client_bank_accounts?.length) {
    return [...client.client_bank_accounts]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(row => ({
        key: row.id,
        id: row.id,
        bank_name: row.bank_name || '',
        iban: normalizeIban(row.iban),
        bic: normalizeBic(row.bic),
        iban_currency: normalizeIbanCurrency(row.iban_currency),
        is_default: !!row.is_default
      }))
  }
  if (client.iban || client.bank_name) {
    return [{
      key: newDraftKey(),
      bank_name: client.bank_name || '',
      iban: normalizeIban(client.iban),
      bic: normalizeBic(client.bic),
      iban_currency: normalizeIbanCurrency(client.iban_currency),
      is_default: true
    }]
  }
  return [firstClientBankAccount()]
}

export function addClientBankAccount(accounts: ClientBankAccountDraft[]): ClientBankAccountDraft[] {
  const base = accounts.length ? accounts : [firstClientBankAccount()]
  const hasLeiDefault = base.some(a => a.is_default && normalizeIbanCurrency(a.iban_currency) === 'LEI')
  return [...base, emptyClientBankAccount('LEI', !hasLeiDefault)]
}

export function setDefaultBankAccount(accounts: ClientBankAccountDraft[], key: string): ClientBankAccountDraft[] {
  const target = accounts.find(a => a.key === key)
  if (!target) return accounts
  const currency = normalizeIbanCurrency(target.iban_currency)
  return accounts.map(row => (
    normalizeIbanCurrency(row.iban_currency) === currency
      ? { ...row, is_default: row.key === key }
      : row
  ))
}

export function ensureBankDefaults(accounts: ClientBankAccountDraft[]): ClientBankAccountDraft[] {
  const next = accounts.map(row => ({ ...row, iban_currency: normalizeIbanCurrency(row.iban_currency) }))
  for (const currency of ['LEI', 'EUR'] as const) {
    const ofCurrency = next.filter(a => a.iban_currency === currency && isBankAccountComplete(a))
    if (!ofCurrency.length) continue
    if (!ofCurrency.some(a => a.is_default)) {
      const first = ofCurrency[0]
      for (const row of next) {
        if (row.key === first.key) row.is_default = true
      }
    }
  }
  return next
}

export function canRemoveBankAccount(accounts: ClientBankAccountDraft[], key: string) {
  const target = accounts.find(a => a.key === key)
  if (!target) return false
  const others = accounts.filter(a => a.key !== key)
  if (!others.length) return false
  if (!target.is_default) return true
  const sameCurrency = others.filter(
    a => normalizeIbanCurrency(a.iban_currency) === normalizeIbanCurrency(target.iban_currency)
  )
  return sameCurrency.length === 0
}

export function removeClientBankAccount(accounts: ClientBankAccountDraft[], key: string): ClientBankAccountDraft[] {
  if (!canRemoveBankAccount(accounts, key)) return accounts
  return ensureBankDefaults(accounts.filter(a => a.key !== key))
}

export function defaultBankFields(accounts: ClientBankAccountDraft[]) {
  const complete = accounts.filter(isBankAccountComplete)
  const leiDefault = complete.find(a => a.is_default && a.iban_currency === 'LEI')
  const eurDefault = complete.find(a => a.is_default && a.iban_currency === 'EUR')
  const anyDefault = complete.find(a => a.is_default)
  const pick = leiDefault || anyDefault || eurDefault || complete[0]
  if (!pick) {
    return {
      bank_name: '',
      iban: '',
      bic: '',
      iban_currency: 'LEI' as const
    }
  }
  return {
    bank_name: pick.bank_name,
    iban: normalizeIban(pick.iban),
    bic: normalizeBic(pick.bic),
    iban_currency: normalizeIbanCurrency(pick.iban_currency)
  }
}

export function bankAccountInsertRows(
  clientId: string,
  userId: string,
  companyId: string | null | undefined,
  accounts: ClientBankAccountDraft[]
) {
  const rows = ensureBankDefaults(accounts.filter(isBankAccountComplete)).map((a, i) => ({
    client_id: clientId,
    user_id: userId,
    company_id: companyId || null,
    bank_name: a.bank_name.trim(),
    iban: normalizeIban(a.iban),
    bic: normalizeBic(a.bic),
    iban_currency: normalizeIbanCurrency(a.iban_currency),
    is_default: !!a.is_default,
    sort_order: i
  }))
  return rows
}

export function isMissingBankAccountsError(error: { message?: string; code?: string } | null | undefined) {
  const msg = (error?.message || '').toLowerCase()
  return (
    error?.code === 'PGRST200' ||
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    (msg.includes('client_bank_accounts') &&
      (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find') || msg.includes('relationship')))
  )
}
