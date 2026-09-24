import { normalizeInvoiceNumber, normalizeSeries } from '@/lib/bank/matching/normalize'

const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi
const CUI_RE = /\bRO\d{2,10}\b/gi
const DATE_RE = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g
const AMOUNT_RE = /\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b|\b\d+[.,]\d{2}\b/g

export type ExtractedRef = {
  series: string
  number: string
}

function maskProtected(text: string) {
  return text
    .replace(IBAN_RE, ' ')
    .replace(CUI_RE, ' ')
    .replace(DATE_RE, ' ')
    .replace(AMOUNT_RE, ' ')
}

function uniqueRefs(refs: ExtractedRef[]) {
  const seen = new Set<string>()
  const out: ExtractedRef[] = []
  for (const ref of refs) {
    const key = `${ref.series}:${ref.number}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

function resolveSeries(token: string, seriesList: string[]) {
  const compact = normalizeSeries(token)
  if (!compact) return ''
  const exact = seriesList.find(series => normalizeSeries(series) === compact)
  if (exact) return normalizeSeries(exact)
  const prefixed = seriesList.filter(series => normalizeSeries(series).startsWith(compact))
  if (prefixed.length === 1) return normalizeSeries(prefixed[0])
  return compact
}

export function extractInvoiceRefs(
  text: string,
  seriesList: string[],
  defaultSeries: string
) {
  const haystack = maskProtected(String(text || '').toUpperCase())
  const known = [...new Set(seriesList.map(normalizeSeries).filter(Boolean))]
  const refs: ExtractedRef[] = []

  const seriesPattern = known.length
    ? known.map(series => series.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    : '[A-Z]{1,8}'
  const withSeries = new RegExp(`\\b(${seriesPattern})(?:\\s|[.\\-/])*([0-9]{1,10})\\b`, 'gi')
  let match: RegExpExecArray | null
  while ((match = withSeries.exec(haystack))) {
    const series = resolveSeries(match[1], known)
    refs.push({ series, number: normalizeInvoiceNumber(match[2]) })
  }

  const dotted = /\b([A-Z])[.](\d{1,10})\b/g
  while ((match = dotted.exec(haystack))) {
    const series = resolveSeries(match[1], known.length ? known : [match[1]])
    refs.push({ series, number: normalizeInvoiceNumber(match[2]) })
  }

  const labeled = /(?:FACTURA|FACT|C\/V\s+FACT)\s+([A-Z]{0,8})[\s.\-/]*([0-9]{1,10})\b/g
  while ((match = labeled.exec(haystack))) {
    const series = resolveSeries(match[1] || defaultSeries, known.length ? known : [defaultSeries])
    refs.push({ series: series || normalizeSeries(defaultSeries), number: normalizeInvoiceNumber(match[2]) })
  }

  return uniqueRefs(refs.filter(ref => ref.series && ref.number))
}
