'use client'
import { emailIssueKey, validateEmail } from '@/lib/email'
import { useLocale } from '@/components/LocaleProvider'

export default function EmailField({
  value,
  onChange,
  required = true,
  label,
  placeholder = 'ex: contact@companie.ro',
  inputClassName = 'input'
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  label?: string
  placeholder?: string
  inputClassName?: string
}) {
  const { t } = useLocale()
  const check = validateEmail(value)
  const showError = !!value.trim() && !check.ok
  return (
    <div>
      <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
        {label || t('common.email')}{required ? ' *' : ''}
      </label>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={254}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => {
          const next = validateEmail(value)
          if (next.normalized && next.normalized !== value) onChange(next.normalized)
        }}
        className={`${inputClassName} ${showError ? 'border-red-300 bg-red-50' : ''}`}
        placeholder={placeholder}
        required={required}
      />
      {showError && (
        <p className="text-red-500 text-xs mt-1">
          {t(emailIssueKey(check.issue), { suggestion: check.suggestion || '' })}
        </p>
      )}
      {check.issue === 'typo' && check.suggestion && (
        <button
          type="button"
          onClick={() => onChange(check.suggestion || '')}
          className="text-xs font-medium text-[color:var(--color-foreground)] mt-1 hover:underline"
        >
          {t('cli.emailUseSuggestion', { suggestion: check.suggestion })}
        </button>
      )}
    </div>
  )
}
