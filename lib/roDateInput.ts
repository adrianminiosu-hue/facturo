/** "2026-09-25" → "25.09.2026" */
export function isoToRo(iso?: string | null) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** "25.09.2026", "25/9/2026", "25-09-26", "25092026" → "2026-09-25"; '' when not a real date. */
export function roToIso(text: string) {
  const s = String(text || '').trim()
  let d: string, m: string, y: string
  const parts = s.match(/^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{2}|\d{4})$/)
  const compact = s.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (parts) [, d, m, y] = parts
  else if (compact) [, d, m, y] = compact
  else return ''
  if (y.length === 2) y = `20${y}`
  const day = Number(d)
  const month = Number(m)
  const year = Number(y)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
