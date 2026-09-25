/** Legal VAT rates after Legea 141/2025 (1 Aug 2025). 9% is housing-only until 30 Sep 2026. */
export const VAT_RATES = [21, 11, 0] as const

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export type InvoiceLineInput = {
  quantity?: number | null
  unit_price?: number | null
  tva_rate?: number | null
  discount_percent?: number | null
  discount_amount?: number | null
  total?: number | null
}

export type HeaderDiscountInput = {
  discount_percent?: number | null
  discount_amount?: number | null
  prepaid_amount?: number | null
  exchange_rate?: number | null
}

export function effectiveExchangeRate(rate?: number | null) {
  const value = Number(rate || 0)
  return value > 0 ? value : 1
}

export function normalizeExchangeRate(rate: number) {
  return Math.round((Number(rate) + Number.EPSILON) * 1e5) / 1e5
}

/** Stored rate, or infer it when lines were saved in RON but unit prices stayed in EUR. */
export function resolveExchangeRate(
  items: InvoiceLineInput[],
  header?: HeaderDiscountInput & { subtotal?: number | null; total?: number | null }
) {
  const stored = Number(header?.exchange_rate || 0)
  if (stored > 0) return normalizeExchangeRate(stored)
  for (const item of items) {
    const net = Number(item.quantity || 0) * Number(item.unit_price || 0)
    const expected = roundMoney(net * (1 + Number(item.tva_rate || 0) / 100))
    const actual = Number(item.total || 0)
    if (expected > 0 && actual > expected * 1.001) return normalizeExchangeRate(actual / expected)
  }
  const rawBase = items.reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.unit_price || 0)
  }, 0)
  const savedBase = Number(header?.subtotal || 0)
  if (rawBase > 0 && savedBase > rawBase * 1.001) return normalizeExchangeRate(savedBase / rawBase)
  return 0
}

export function invoiceConvertedHeader(
  items: InvoiceLineInput[],
  header: HeaderDiscountInput & { subtotal?: number | null; tva_amount?: number | null; total?: number | null } = {}
) {
  const exchange_rate = resolveExchangeRate(items, header)
  const totals = computeInvoiceTotals(items, { ...header, exchange_rate })
  const storedRate = Number(header.exchange_rate || 0)
  const needsPersist = exchange_rate > 0 && (
    !(storedRate > 0) ||
    Math.abs(Number(header.subtotal || 0) - totals.subtotal) > 0.02 ||
    Math.abs(Number(header.tva_amount || 0) - totals.tvaAmount) > 0.02 ||
    Math.abs(Number(header.total || 0) - totals.taxInclusive) > 0.02
  )
  return { exchange_rate, totals, needsPersist }
}

export function vatRateOptions(current?: number) {
  const rate = Number(current)
  if (Number.isFinite(rate) && !(VAT_RATES as readonly number[]).includes(rate)) {
    return [...VAT_RATES, rate].sort((a, b) => b - a)
  }
  return [...VAT_RATES]
}

export function lineDiscount(item: InvoiceLineInput, exchangeRate = 1) {
  const unit = Number(item.unit_price || 0) * effectiveExchangeRate(exchangeRate)
  const gross = roundMoney(Number(item.quantity || 0) * unit)
  const amount = Number(item.discount_amount || 0)
  const percent = Number(item.discount_percent || 0)
  // Negative lines (storno / corrective invoices): the discount shrinks the magnitude and keeps the sign.
  const sign = gross < 0 ? -1 : 1
  const magnitude = Math.abs(gross)
  const discount = amount > 0 ? amount : roundMoney(magnitude * percent / 100)
  const capped = Math.min(Math.max(discount, 0), magnitude)
  return { gross, discount: capped, net: roundMoney(sign * (magnitude - capped)) }
}

export function computeInvoiceTotals(items: InvoiceLineInput[], header: HeaderDiscountInput = {}) {
  const fxRate = effectiveExchangeRate(header.exchange_rate)
  const lines = items.map(item => {
    const { gross, discount, net } = lineDiscount(item, fxRate)
    const rate = Number(item.tva_rate || 0)
    const vat = roundMoney(net * rate / 100)
    return { gross, discount, net, vat, rate, total: roundMoney(net + vat) }
  })

  const lineExtension = roundMoney(lines.reduce((sum, line) => sum + line.net, 0))
  const headerAmount = Number(header.discount_amount || 0)
  const headerPercent = Number(header.discount_percent || 0)
  // Signed like the lines, so a negative (storno) invoice is discounted towards zero, never past it.
  const headerDiscount = headerAmount > 0
    ? Math.sign(lineExtension) * Math.min(headerAmount, Math.abs(lineExtension))
    : roundMoney(lineExtension * headerPercent / 100)
  const taxExclusive = roundMoney(lineExtension - headerDiscount)
  const factor = lineExtension !== 0 ? taxExclusive / lineExtension : 1

  const taxMap = new Map<number, { rate: number; taxable: number; tax: number }>()
  for (const line of lines) {
    const taxable = roundMoney(line.net * factor)
    const tax = roundMoney(line.vat * factor)
    const current = taxMap.get(line.rate) || { rate: line.rate, taxable: 0, tax: 0 }
    current.taxable = roundMoney(current.taxable + taxable)
    current.tax = roundMoney(current.tax + tax)
    taxMap.set(line.rate, current)
  }

  const vatBreakdown = [...taxMap.values()].sort((a, b) => b.rate - a.rate)
  const tvaAmount = roundMoney(vatBreakdown.reduce((sum, row) => sum + row.tax, 0))
  const taxInclusive = roundMoney(taxExclusive + tvaAmount)
  const prepaid = Math.min(Math.max(Number(header.prepaid_amount || 0), 0), Math.max(taxInclusive, 0))
  const payable = roundMoney(taxInclusive - prepaid)

  return {
    lines,
    lineExtension,
    headerDiscount,
    subtotal: taxExclusive,
    tvaAmount,
    taxInclusive,
    prepaid,
    payable,
    total: taxInclusive,
    vatBreakdown
  }
}

export type InvoiceMoneyRow = HeaderDiscountInput & {
  id?: string
  subtotal?: number | null
  tva_amount?: number | null
  total?: number | null
  amount_paid?: number | null
  invoice_items?: InvoiceLineInput[] | null
  items?: InvoiceLineInput[] | null
  exchange_rate_source?: string | null
  exchange_rate_date?: string | null
}

export function invoiceLinesOf(invoice: {
  invoice_items?: InvoiceLineInput[] | null
  items?: InvoiceLineInput[] | null
}) {
  return invoice.invoice_items || invoice.items || []
}

export function billedTotal(invoice: InvoiceMoneyRow) {
  const items = invoiceLinesOf(invoice)
  if (items.length) return invoiceConvertedHeader(items, invoice).totals.taxInclusive
  return Number(invoice.total || 0)
}

export function withConvertedInvoiceAmounts<T extends InvoiceMoneyRow>(invoice: T): T {
  const items = invoiceLinesOf(invoice)
  if (!items.length) return invoice
  const { exchange_rate, totals } = invoiceConvertedHeader(items, invoice)
  return {
    ...invoice,
    subtotal: totals.subtotal,
    tva_amount: totals.tvaAmount,
    total: totals.taxInclusive,
    exchange_rate: exchange_rate || invoice.exchange_rate || null
  }
}

export function remainingOf(invoice: InvoiceMoneyRow) {
  return Math.max(
    0,
    roundMoney(
      billedTotal(invoice) - Number(invoice.prepaid_amount || 0) - Number(invoice.amount_paid || 0)
    )
  )
}
