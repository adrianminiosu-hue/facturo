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
