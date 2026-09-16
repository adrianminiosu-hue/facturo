'use client'
import { useEffect, useRef, useState } from 'react'

export type OverflowAction = {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export default function InvoiceOverflow({ actions }: { actions: OverflowAction[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const visible = actions.filter(Boolean)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (!visible.length) return null

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-xs border border-gray-200 text-gray-600 px-2 py-0.5 rounded-lg hover:bg-gray-50 leading-tight"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Mai multe
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 min-w-[10rem] bg-white border border-gray-200 rounded-xl overflow-hidden py-1">
          {visible.map(action => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={() => { setOpen(false); action.onClick() }}
              className={`block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-40 ${action.danger ? 'text-red-600' : 'text-gray-700'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
