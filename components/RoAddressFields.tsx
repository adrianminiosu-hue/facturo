'use client'
import { BUCHAREST_SECTORS, RO_COUNTIES } from '@/lib/romania'
import { useLocale } from '@/components/LocaleProvider'

export type RoAddressValue = {
  county_code: string
  postal_code: string
  city: string
  country: string
}

export default function RoAddressFields({
  value,
  onChange,
  disabled = false
}: {
  value: RoAddressValue
  onChange: (next: RoAddressValue) => void
  disabled?: boolean
}) {
  const { t } = useLocale()
  const isBucharest = value.county_code === 'B'
  const fieldClass = `input ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
          {t('common.county')} *
        </label>
        <select
          value={value.county_code}
          disabled={disabled}
          onChange={e => {
            const county_code = e.target.value
            onChange({
              ...value,
              county_code,
              city: county_code === 'B' && !BUCHAREST_SECTORS.some(sector => sector === value.city) ? '' : value.city
            })
          }}
          className={`${fieldClass} bg-white`}
        >
          <option value="">{t('common.selectCounty')}</option>
          {RO_COUNTIES.map(county => (
            <option key={county.code} value={county.code}>{county.name} ({county.code})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
          {t('common.postalCode')}
        </label>
        <input
          type="text"
          value={value.postal_code}
          disabled={disabled}
          onChange={e => onChange({ ...value, postal_code: e.target.value })}
          className={fieldClass}
          placeholder="010101"
          maxLength={10}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
          {isBucharest ? `${t('common.sector')} *` : `${t('common.city')} *`}
        </label>
        {isBucharest ? (
          <select
            value={value.city}
            disabled={disabled}
            onChange={e => onChange({ ...value, city: e.target.value })}
            className={`${fieldClass} bg-white`}
          >
            <option value="">{t('common.selectSector')}</option>
            {BUCHAREST_SECTORS.map(sector => (
              <option key={sector} value={sector}>{sector}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value.city}
            disabled={disabled}
            onChange={e => onChange({ ...value, city: e.target.value })}
            className={fieldClass}
            placeholder="Cluj-Napoca"
          />
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('common.country')}</label>
        <input
          type="text"
          value={value.country}
          disabled={disabled}
          onChange={e => onChange({ ...value, country: e.target.value.toUpperCase() })}
          className={fieldClass}
          placeholder="RO"
          maxLength={2}
        />
      </div>
    </>
  )
}
