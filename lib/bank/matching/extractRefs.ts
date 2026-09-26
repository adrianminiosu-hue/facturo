import { normalizeInvoiceNumber, normalizeSeries } from '@/lib/bank/matching/normalize'

const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi
const CUI_RE = /\b(?:RO\d{2,10}|(?:CUI|CIF|C\.U\.I\.|COD FISCAL)[\s.:]*\d{2,10})\b/gi
const DATE_RE = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g
const AMOUNT_RE = /\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b|\b\d+[.,]\d{2}\b|\b\d+\s*(?:LEI|RON|EUR|USD)\b/g

/** Words that introduce an invoice number on a payment order ("PLATA FACTURA NR. 31", "FF 34", "C/V FACT. 12"). */
const LABEL = '(?:C\\/V\\s+)?(?:FACTURILOR|FACTURILE|FACTURII|FACTURA|FACTURI|FACTURE|FACT|FACTUR|FF|F\\.F\\.|INVOICES|INVOICE|INV)'
const FISCAL = '(?:\\s+FISCAL[AE]?)?'
const NUMBER_WORD = '(?:\\s*(?:NR|NO|NUMAR|NUMARUL|NUM)\\b\\.?)?'
/** List separators after a number: "FCT18, 19", "41 si 42", "12+13", "5 & 6". Not "/", which is usually a date or a year. */
const LIST_TAIL = /^\s*(?:,|;|\+|&|\bSI\b|\bAND\b)\s*([A-Z]{0,8})[\s.\-]*(\d{1,10})\b/

export type ExtractedRef = {
  series: string
  number: string
  /** A number picked up from a list ("FCT18, 19"). Only trusted when it belongs to the same client as a direct reference. */
  listed?: boolean
  /** No series was written ("FACTURA NR 31"): the default series was assumed, any series may match. */
  anySeries?: boolean
}

/** Upper case without diacritics, punctuation kept ("Factură nr. 41" -> "FACTURA NR. 41"). */
function foldText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .toUpperCase()
}

function maskProtected(text: string) {
  return text
    .replace(IBAN_RE, ' ')
    .replace(CUI_RE, ' ')
    .replace(DATE_RE, ' ')
    .replace(AMOUNT_RE, ' ')
}

function uniqueRefs(refs: ExtractedRef[]) {
  const byKey = new Map<string, ExtractedRef>()
  for (const ref of refs) {
    const key = `${ref.series}:${ref.number}`
    const seen = byKey.get(key)
    if (!seen) byKey.set(key, ref)
    else if (seen.listed && !ref.listed) byKey.set(key, ref)
  }
  return [...byKey.values()]
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

function isKnownSeries(token: string, known: string[]) {
  const compact = normalizeSeries(token)
  return !!compact && known.some(series => series === compact || (compact.length >= 2 && series.startsWith(compact)))
}

/** Numbers listed right after a match: "FCT18, 19 si 21" -> 19, 21 (series inherited unless repeated). */
function listedAfter(haystack: string, from: number, series: string, known: string[]) {
  const out: ExtractedRef[] = []
  let rest = haystack.slice(from)
  for (let guard = 0; guard < 12; guard += 1) {
    const match = LIST_TAIL.exec(rest)
    if (!match) break
    const token = match[1]
    if (token && !isKnownSeries(token, known)) break
    out.push({
      series: token ? resolveSeries(token, known) : series,
      number: normalizeInvoiceNumber(match[2]),
      listed: true
    })
    rest = rest.slice(match.index + match[0].length)
  }
  return out
}

export function extractInvoiceRefs(
  text: string,
  seriesList: string[],
  defaultSeries: string
) {
  const haystack = maskProtected(foldText(String(text || '')))
  const known = [...new Set(seriesList.map(normalizeSeries).filter(Boolean))]
  const fallbackSeries = normalizeSeries(defaultSeries)
  const refs: ExtractedRef[] = []

  const seriesPattern = known.length
    ? known.map(series => series.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    : '[A-Z]{1,8}'
  const withSeries = new RegExp(`\\b(${seriesPattern})(?:\\s|[.\\-/])*([0-9]{1,10})\\b`, 'gi')
  let match: RegExpExecArray | null
  while ((match = withSeries.exec(haystack))) {
    const series = resolveSeries(match[1], known)
    refs.push({ series, number: normalizeInvoiceNumber(match[2]) })
    refs.push(...listedAfter(haystack, match.index + match[0].length, series, known))
  }

  const dotted = /\b([A-Z])[.](\d{1,10})\b/g
  while ((match = dotted.exec(haystack))) {
    const series = resolveSeries(match[1], known.length ? known : [match[1]])
    refs.push({ series, number: normalizeInvoiceNumber(match[2]) })
  }

  // "FACTURA NR. 31", "FF 34", "FACTURA FISCALA SERIA X NR 12", "FACT ABC-12"
  const labeled = new RegExp(
    `(?:^|[^A-Z])${LABEL}(?![A-Z])${FISCAL}${NUMBER_WORD}\\s*(?:SERIA\\s+)?([A-Z]{0,8}?)${NUMBER_WORD}[\\s.\\-/:#]*([0-9]{1,10})\\b`,
    'g'
  )
  while ((match = labeled.exec(haystack))) {
    const raw = match[1] || ''
    const token = /^(?:NR|NO|NUMAR|NUMARUL|NUM|SERIA)$/.test(raw) ? '' : raw
    const series = token
      ? resolveSeries(token, known.length ? known : [token])
      : fallbackSeries
    if (!series) continue
    refs.push({ series, number: normalizeInvoiceNumber(match[2]), ...(token ? {} : { anySeries: true }) })
    refs.push(...listedAfter(haystack, match.index + match[0].length, series, known).map(ref =>
      token || ref.series !== series ? ref : { ...ref, anySeries: true }
    ))
  }

  return uniqueRefs(refs.filter(ref => ref.series && ref.number))
}
