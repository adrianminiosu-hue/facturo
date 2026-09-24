export function maskIban(value?: string | null) {
  const iban = String(value || '').replace(/\s/g, '').toUpperCase()
  if (iban.length < 8) return iban || '—'
  return `${iban.slice(0, 4)}••••${iban.slice(-4)}`
}

export function confidenceKind(confidence?: number | null) {
  const n = Number(confidence || 0)
  if (n >= 90) return 'sure' as const
  if (n >= 70) return 'likely' as const
  return 'possible' as const
}

export function paymentSourceKey(source?: string | null, method?: string | null) {
  if (method === 'compensation' || source === 'storno') return 'bank.src.storno'
  if (source === 'xml940') return 'bank.src.xml940'
  if (source === 'camt053') return 'bank.src.camt053'
  if (source === 'csv') return 'bank.src.csv'
  if (source === 'bank_api' || source === 'api') return 'bank.src.api'
  return 'bank.src.manual'
}

export function txStatusKey(status?: string | null) {
  if (status === 'matched') return 'bank.status.auto'
  if (status === 'partially_matched') return 'bank.status.confirmed'
  if (status === 'suggested' || status === 'unmatched') return 'bank.status.inbox'
  if (status === 'ignored') return 'bank.status.ignored'
  return 'bank.status.inbox'
}

export function paymentStatusKey(status?: string | null) {
  if (status === 'paid') return 'bank.pay.paid'
  if (status === 'partial') return 'bank.pay.partial'
  return 'bank.pay.unpaid'
}
