'use client'
import {
  ROMANIAN_BANK_NAMES,
  RO_IBAN_PLACEHOLDER,
  applyBankSelection,
  applyBicInput,
  applyIbanInput,
  bicLiveHint,
  ibanLiveHint
} from '@/lib/roBanks'

type BankFields = {
  bank_name: string
  iban: string
  bic: string
}

export default function BankDetailsFields({
  value,
  onChange
}: {
  value: BankFields
  onChange: (next: BankFields) => void
}) {
  const ibanHint = ibanLiveHint(value.iban, value.bank_name)
  const bicHint = bicLiveHint(value.bic, value.bank_name, value.iban)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:col-span-2">
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Bancă emitentă</label>
        <select
          value={value.bank_name}
          onChange={e => onChange(applyBankSelection(e.target.value, value))}
          className="input bg-white"
        >
          <option value="">Selectează banca...</option>
          {ROMANIAN_BANK_NAMES.map(bank => (
            <option key={bank} value={bank}>{bank}</option>
          ))}
        </select>
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
          placeholder="RNCBROBU"
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
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Cont bancar (IBAN)</label>
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
    </div>
  )
}
