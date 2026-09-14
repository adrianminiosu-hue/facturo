const IBAN_RE = /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b/i

export function normalizeIban(value?: string | null) {
  return String(value || '').replace(/[\s-]/g, '').toUpperCase()
}

export function extractIban(value?: string | null) {
  const compact = normalizeIban(value)
  const match = compact.match(IBAN_RE)
  return match ? match[0].toUpperCase() : ''
}

export function ibansEqual(a?: string | null, b?: string | null) {
  const left = normalizeIban(a)
  const right = normalizeIban(b)
  return !!left && !!right && left === right
}
