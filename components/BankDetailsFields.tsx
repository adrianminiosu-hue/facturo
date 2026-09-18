'use client'
import {
  IBAN_CURRENCIES,
  ROMANIAN_BANK_NAMES,
  RO_IBAN_PLACEHOLDER,
  applyBankSelection,
  applyBicInput,
  applyIbanInput,
  bicLiveHint,
  ibanLiveHint,
  normalizeIbanCurrency,
  type BankAccountFields
} from '@/lib/roBanks'

export default function BankDetailsFields({
  value,
  onChange,
  required = false
}: {
  value: BankAccountFields
  onChange: (next: BankAccountFields) => void
  required?: boolean
}) {
  const ibanHint = ibanLiveHint(value.iban, value.bank_name)
  const bicHint = bicLiveHint(value.bic, value.bank_name, value.iban)
  const star = required ? ' *' : ''

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:col-span-2">
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Bancă emitentă{star}</label>
        <select
          value={value.bank_name}
          onChange={e => onChange(applyBankSelection(e.target.value, value))}
          className="input bg-white"
          required={required}
        >
          <option value="">Selectează banca...</option>
          {ROMANIAN_BANK_NAMES.map(bank => (
            <option key={bank} value={bank}>{bank}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Monedă</label>
        <select
          value={normalizeIbanCurrency(value.iban_currency)}
          onChange={e => onChange({ ...value, iban_currency: normalizeIbanCurrency(e.target.value) })}
          className="input bg-white"
        >
          {IBAN_CURRENCIES.map(currency => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Cont bancar (IBAN){star}</label>
        <input
          type="text"
          value={value.iban}
          onChange={e => onChange(applyIbanInput(e.target.value, value))}
          className={`input ${
            ibanHint.tone === 'error'
              ? 'border-red-300 bg-red-50'
              : ibanHint.tone === 'ok'
              ? 'border-green-300 bg-green-50'
              : ''
          }`}
          placeholder={RO_IBAN_PLACEHOLDER}
          maxLength={34}
          autoComplete="off"
          spellCheck={false}
          required={required}
        />
        {ibanHint.message && (
          <p className={`text-xs mt-1 ${
            ibanHint.tone === 'error' ? 'text-red-500' :
            ibanHint.tone === 'warn' ? 'text-amber-500' :
            ibanHint.tone === 'ok' ? 'text-green-500' : 'text-[color:var(--color-muted-foreground)]'
          }`}>
            {ibanHint.message}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">BIC / SWIFT</label>
        <input
          type="text"
          value={value.bic}
          onChange={e => onChange(applyBicInput(e.target.value, value))}
          className={`input ${
            bicHint.tone === 'error'
              ? 'border-red-300 bg-red-50'
              : bicHint.tone === 'ok'
              ? 'border-green-300 bg-green-50'
              : ''
          }`}
          placeholder="OTPVROBU"
          maxLength={14}
          autoComplete="off"
          spellCheck={false}
        />
        {bicHint.message && (
          <p className={`text-xs mt-1 ${
            bicHint.tone === 'error' ? 'text-red-500' :
            bicHint.tone === 'ok' ? 'text-green-500' : 'text-[color:var(--color-muted-foreground)]'
          }`}>
            {bicHint.message}
          </p>
        )}
      </div>
    </div>
  )
}
