import { resolveExchangeRate } from '@/lib/invoiceMath'

export type InvoiceFxValue = {
  enabled: boolean
  rate: number
  source: string
  date: string
}

export const BNR_FX_URL = 'https://www.bnr.ro/Cursul-de-schimb-524.aspx'

export function emptyInvoiceFx(date = ''): InvoiceFxValue {
  return { enabled: false, rate: 0, source: 'BNR', date }
}

export function invoiceFxFromRow(
  row?: {
    exchange_rate?: number | null
    exchange_rate_source?: string | null
    exchange_rate_date?: string | null
    subtotal?: number | null
    total?: number | null
  } | null,
  items?: { quantity?: number | null; unit_price?: number | null; tva_rate?: number | null; total?: number | null }[]
): InvoiceFxValue {
  const rate = resolveExchangeRate(items || [], row || {})
  return {
    enabled: rate > 0,
    rate: rate > 0 ? rate : 0,
    source: row?.exchange_rate_source || 'BNR',
    date: row?.exchange_rate_date || ''
  }
}

export function fxPersistFields(fx: InvoiceFxValue) {
  if (!fx.enabled || !(fx.rate > 0)) {
    return {
      exchange_rate: null,
      exchange_rate_source: null,
      exchange_rate_date: null
    }
  }
  return {
    exchange_rate: fx.rate,
    exchange_rate_source: fx.source || 'BNR',
    exchange_rate_date: fx.date || null
  }
}

export function parseExchangeRate(value: string) {
  const parsed = parseFloat(value.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** BNR publishes 4 decimals: 5.02 → "5,0200". */
export function formatFxRate(rate: number) {
  return Number(rate).toLocaleString('ro-RO', { minimumFractionDigits: 4, maximumFractionDigits: 5 })
}

function roDate(iso?: string | null) {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** "1 EUR = 5,0851 lei (BNR, 23.09.2026)" */
export function fxRateLine(rate: number, source?: string | null, date?: string | null) {
  const meta = [source || '', roDate(date)].filter(Boolean).join(', ')
  return `1 EUR = ${formatFxRate(rate)} lei${meta ? ` (${meta})` : ''}`
}

/** Mention printed on the invoice (PDF, Mențiuni, e-Factura note) when prices are in EUR. */
export function fxMention(rate: number, source?: string | null, date?: string | null) {
  const which = source === 'BNR' ? 'cursul BNR' : 'cursul'
  const when = roDate(date)
  return `Prețurile unitare sunt exprimate în EUR și convertite în lei la ${which} de ${formatFxRate(rate)} lei/EUR${when ? ` din ${when}` : ''}. Plata se face în lei.`
}

/** Notes + FX mention, without repeating it if the user already wrote it. */
export function notesWithFxMention(notes: string, rate: number, source?: string | null, date?: string | null) {
  if (!(rate > 0)) return notes
  const mention = fxMention(rate, source, date)
  if (notes.includes('convertite în lei la')) return notes
  return [notes, mention].filter(Boolean).join('\n')
}
