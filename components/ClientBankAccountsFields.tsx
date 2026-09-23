'use client'
import { useEffect, useState } from 'react'
import BankDetailsFields from '@/components/BankDetailsFields'
import {
  addClientBankAccount,
  canRemoveBankAccount,
  ensureBankDefaults,
  firstClientBankAccount,
  isBankAccountComplete,
  isBankAccountValid,
  removeClientBankAccount,
  setDefaultBankAccount,
  type ClientBankAccountDraft
} from '@/lib/clientBanks'
import { normalizeIbanCurrency } from '@/lib/roBanks'
import { useLocale } from '@/components/LocaleProvider'

export default function ClientBankAccountsFields({
  accounts,
  onChange
}: {
  accounts: ClientBankAccountDraft[]
  onChange: (next: ClientBankAccountDraft[]) => void
}) {
  const { t } = useLocale()
  const rows = accounts.length ? accounts : [firstClientBankAccount()]
  const accountKeys = rows.map(row => row.key).join('|')
  const [editingKey, setEditingKey] = useState<string | null>(
    rows.length === 1 && !isBankAccountComplete(rows[0]) ? rows[0].key : null
  )
  const [snapshot, setSnapshot] = useState<ClientBankAccountDraft | null>(
    rows.length === 1 && !isBankAccountComplete(rows[0]) ? { ...rows[0] } : null
  )

  useEffect(() => {
    if (editingKey && rows.some(row => row.key === editingKey)) return
    const first = rows[0]
    if (rows.length === 1 && first && !isBankAccountComplete(first)) {
      setEditingKey(first.key)
      setSnapshot({ ...first })
      return
    }
    if (!editingKey) return
    setEditingKey(null)
    setSnapshot(null)
  }, [accountKeys, editingKey, rows])

  const update = (key: string, patch: Partial<ClientBankAccountDraft>) => {
    const source = accounts.length ? accounts : rows
    let next = source.map(a => a.key === key ? { ...a, ...patch } : a)
    const current = next.find(a => a.key === key)
    if (current?.is_default) next = setDefaultBankAccount(next, key)
    onChange(next)
  }

  const editing = rows.find(row => row.key === editingKey) || null
  const savedRows = rows.filter(row => row.key !== editingKey)
  const showCancel = savedRows.length > 0 || (!!snapshot && isBankAccountComplete(snapshot))

  const startEdit = (row: ClientBankAccountDraft) => {
    setSnapshot({ ...row })
    setEditingKey(row.key)
  }

  const startNew = () => {
    if (editingKey) {
      alert(t('bnk.saveFirst'))
      return
    }
    const next = addClientBankAccount(rows)
    const created = next[next.length - 1]
    setSnapshot({ ...created })
    setEditingKey(created.key)
    onChange(next)
  }

  const saveAccount = () => {
    if (!editing) return
    if (!isBankAccountComplete(editing)) {
      alert(t('bnk.completeFirst'))
      return
    }
    const check = isBankAccountValid(editing)
    if (!check.ok) {
      alert(check.error || t('bnk.invalid'))
      return
    }
    onChange(ensureBankDefaults(rows))
    setEditingKey(null)
    setSnapshot(null)
  }

  const deleteAccount = (row: ClientBankAccountDraft) => {
    if (!canRemoveBankAccount(rows, row.key)) {
      alert(t('bnk.cannotDeleteDefault'))
      return
    }
    onChange(removeClientBankAccount(rows, row.key))
  }

  const cancelEdit = () => {
    if (!editingKey) return
    const current = rows.find(row => row.key === editingKey)
    const isNewUnsaved = !!current && !current.id && !isBankAccountComplete(snapshot || current)
    if (isNewUnsaved && savedRows.length) {
      onChange(savedRows)
    } else if (snapshot) {
      onChange(rows.map(row => row.key === editingKey ? snapshot : row))
    }
    setEditingKey(null)
    setSnapshot(null)
  }

  const toggleDefault = (row: ClientBankAccountDraft, checked: boolean) => {
    if (checked) {
      onChange(setDefaultBankAccount(rows, row.key))
      return
    }
    const sameCurrency = rows.filter(
      a => a.key !== row.key && normalizeIbanCurrency(a.iban_currency) === normalizeIbanCurrency(row.iban_currency)
    )
    if (!sameCurrency.length) return
    alert(t('bnk.uncheckDefault'))
  }

  return (
    <div className="mb-1 md:col-span-2">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">
            {t('bnk.title')}
          </p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            {t('bnk.lead')}
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={!!editingKey}
          className="btn btn-outline px-3 py-2 text-xs whitespace-nowrap disabled:opacity-50"
        >
          {t('bnk.add')}
        </button>
      </div>

      {savedRows.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
          <div className="hidden md:grid grid-cols-12 px-4 py-2 border-b border-gray-100 bg-gray-50">
            <span className="col-span-3 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('common.bank')}</span>
            <span className="col-span-4 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('common.iban')}</span>
            <span className="col-span-1 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('common.currency')}</span>
            <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">{t('common.default')}</span>
            <span className="col-span-2 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider text-right">{t('common.actions')}</span>
          </div>
          {savedRows.map((row, index) => (
            <div
              key={row.key}
              className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-0 px-4 py-3 items-center ${index !== savedRows.length - 1 ? 'border-b border-gray-50' : ''}`}
            >
              <div className="md:col-span-3 min-w-0">
                <p className="text-sm font-medium text-[color:var(--color-foreground)] truncate">{row.bank_name || '—'}</p>
                {row.bic && (
                  <p className="text-xs text-[color:var(--color-muted-foreground)] font-mono truncate">{row.bic}</p>
                )}
              </div>
              <p className="md:col-span-4 text-sm font-mono text-[color:var(--color-foreground)] truncate" title={row.iban}>
                {row.iban || '—'}
              </p>
              <p className="md:col-span-1 text-sm text-[color:var(--color-foreground)]">
                {normalizeIbanCurrency(row.iban_currency)}
              </p>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                <input
                  type="checkbox"
                  checked={row.is_default}
                  onChange={e => toggleDefault(row, e.target.checked)}
                />
                {t('bnk.defaultCur', { currency: normalizeIbanCurrency(row.iban_currency) })}
              </label>
              <div className="md:col-span-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => deleteAccount(row)}
                  disabled={!canRemoveBankAccount(rows, row.key)}
                  title={!canRemoveBankAccount(rows, row.key)
                    ? t('bnk.markOther')
                    : t('bnk.deleteTitle')}
                  className="text-xs border border-red-100 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
              {savedRows.length === 0 ? t('bnk.account') : t('bnk.newEdit')}
            </p>
            <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
              <input
                type="checkbox"
                checked={editing.is_default}
                onChange={e => toggleDefault(editing, e.target.checked)}
              />
              {t('bnk.defaultAccount', { currency: normalizeIbanCurrency(editing.iban_currency) })}
            </label>
          </div>
          <BankDetailsFields
            required
            value={{
              bank_name: editing.bank_name,
              iban: editing.iban,
              bic: editing.bic,
              iban_currency: normalizeIbanCurrency(editing.iban_currency)
            }}
            onChange={next => update(editing.key, next)}
          />
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={saveAccount} className="btn btn-primary">
              {t('bnk.save')}
            </button>
            {showCancel && (
              <button type="button" onClick={cancelEdit} className="btn btn-outline">
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}

      {!editing && savedRows.length === 0 && (
        <p className="text-sm text-[color:var(--color-muted-foreground)]">{t('bnk.empty')}</p>
      )}
    </div>
  )
}
