/** Display format: 1,234.56 (thousands comma, decimal point, two places). Not for UBL/XML. */
export function formatAmount(value: number | string | null | undefined) {
  const amount = Number(value)
  const n = Number.isFinite(amount) ? amount : 0
  const negative = n < 0
  const [int, frac] = Math.abs(n).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}.${frac}`
}

export function formatRon(value: number | string | null | undefined) {
  return `${formatAmount(value)} RON`
}
