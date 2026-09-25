'use client'
import { useEffect, useRef, useState } from 'react'
import { isoToRo, roToIso } from '@/lib/roDateInput'

type DateFieldProps = {
  value?: string | null
  /** Same shape as a native input's change event, so it drops in for <input type="date">. */
  onChange?: (event: { target: { value: string } }) => void
  className?: string
  min?: string
  max?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  id?: string
  name?: string
  title?: string
  'aria-label'?: string
}

/**
 * Date input shown as zz.ll.aaaa whatever the browser language (the native date input follows
 * the browser, so an English Chrome shows mm/dd/yyyy). Value in and out stays ISO (YYYY-MM-DD).
 */
export default function DateField({ value, onChange, className = 'input', min, max, disabled, readOnly, required, id, name, title, ...rest }: DateFieldProps) {
  const [text, setText] = useState(isoToRo(value))
  const [focused, setFocused] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused || roToIso(text) !== (value || '')) setText(isoToRo(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = (iso: string) => onChange?.({ target: { value: iso } })

  const commit = () => {
    setFocused(false)
    if (!text.trim()) {
      if (value) emit('')
      return
    }
    const iso = roToIso(text)
    if (iso) {
      setText(isoToRo(iso))
      if (iso !== value) emit(iso)
    } else {
      setText(isoToRo(value))
    }
  }

  const openPicker = () => {
    const el = picker.current
    if (!el || disabled || readOnly) return
    try {
      if (typeof el.showPicker === 'function') el.showPicker()
      else el.click()
    } catch {
      el.focus()
    }
  }

  const iso = roToIso(text)
  const outOfRange = !!iso && ((!!min && iso < min) || (!!max && iso > max))

  return (
    <span className="relative block w-full">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        name={name}
        title={title}
        aria-label={rest['aria-label']}
        aria-invalid={outOfRange || (!!text && !iso) || undefined}
        className={`${className} pr-10`}
        placeholder="zz.ll.aaaa"
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        onFocus={() => setFocused(true)}
        onChange={e => {
          setText(e.target.value)
          const next = roToIso(e.target.value)
          if (next && next !== value) emit(next)
        }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Alege data din calendar"
        onClick={openPicker}
        disabled={disabled || readOnly}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute left-0 bottom-0 w-full h-0 opacity-0 pointer-events-none"
        value={value || ''}
        min={min}
        max={max}
        onChange={e => {
          setText(isoToRo(e.target.value))
          emit(e.target.value)
        }}
      />
    </span>
  )
}
