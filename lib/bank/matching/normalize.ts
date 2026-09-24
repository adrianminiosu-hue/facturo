import { normalizeIban } from '@/lib/iban'
import { stripDiacritics } from '@/lib/romania'

const LEGAL_NOISE = new Set([
  'SRL', 'SA', 'PFA', 'PF', 'SC', 'SCA', 'SNC', 'RA', 'IFN',
  'SRLD', 'II', 'IF', 'ONG', 'ASOC', 'ASSOCIATIA', 'FUNDATIA',
  'COMPANY', 'LTD', 'COM'
])

export function normalizePartyName(value?: string | null) {
  const tokens = stripDiacritics(String(value || ''))
    .split(' ')
    .map(token => token.replace(/^[.\-/]+|[.\-/]+$/g, ''))
    .filter(token => token && !LEGAL_NOISE.has(token))
  return tokens.join(' ')
}

export function namesSimilar(a?: string | null, b?: string | null) {
  const left = normalizePartyName(a)
  const right = normalizePartyName(b)
  if (!left || !right) return false
  if (left === right) return true
  const leftTokens = left.split(' ').filter(token => token.length > 1)
  const rightTokens = right.split(' ').filter(token => token.length > 1)
  if (leftTokens.length === 0 || rightTokens.length === 0) return false
  const rightSet = new Set(rightTokens)
  const leftSet = new Set(leftTokens)
  return leftTokens.every(token => rightSet.has(token)) || rightTokens.every(token => leftSet.has(token))
}

export function normalizeSeries(value?: string | null) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizeInvoiceNumber(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.replace(/^0+/, '') || '0'
}

export function invoiceKey(series: string, number: string) {
  return `${normalizeSeries(series)}:${normalizeInvoiceNumber(number)}`
}

export function sameIban(a?: string | null, b?: string | null) {
  const left = normalizeIban(a)
  const right = normalizeIban(b)
  return !!left && !!right && left === right
}
