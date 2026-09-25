/** Romanian display format: 1.234,56 (dot for thousands, comma for decimals). Not for UBL/XML. */
export function formatAmount(value: number | string | null | undefined) {
  const amount = Number(value)
  const n = Number.isFinite(amount) ? amount : 0
  const [int, frac] = Math.abs(n).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  // No minus sign for an amount that rounds to 0,00.
  const negative = n < 0 && (int !== '0' || frac !== '00')
  return `${negative ? '-' : ''}${grouped},${frac}`
}

export function formatRon(value: number | string | null | undefined) {
  return `${formatAmount(value)} RON`
}

/** Days / small decimals: 4.3 → "4,3", 12 → "12". */
export function formatDecimal(value: number, digits = 1) {
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits).replace('.', ',')
}

/**
 * Parses what a person types: "1.234,56", "1234,56", "1234.56", "1 234,56".
 * With a comma present, dots are thousands separators; otherwise a single dot is the decimal point.
 */
export function parseAmount(text: string | number | null | undefined): number {
  if (typeof text === 'number') return text
  let s = String(text ?? '').trim().replace(/[\s\u00a0]/g, '').replace(/(RON|lei|EUR)$/i, '')
  if (!s) return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}
