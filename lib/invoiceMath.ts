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
}

export type HeaderDiscountInput = {
  discount_percent?: number | null
  discount_amount?: number | null
  prepaid_amount?: number | null
}

export function vatRateOptions(current?: number) {
  const rate = Number(current)
  if (Number.isFinite(rate) && !(VAT_RATES as readonly number[]).includes(rate)) {
    return [...VAT_RATES, rate].sort((a, b) => b - a)
  }
  return [...VAT_RATES]
}

export function lineDiscount(item: InvoiceLineInput) {
  const gross = roundMoney(Number(item.quantity || 0) * Number(item.unit_price || 0))
  const amount = Number(item.discount_amount || 0)
  const percent = Number(item.discount_percent || 0)
  const discount = amount > 0 ? amount : roundMoney(gross * percent / 100)
  const capped = Math.min(Math.max(discount, 0), gross)
  return { gross, discount: capped, net: roundMoney(gross - capped) }
}

export function computeInvoiceTotals(items: InvoiceLineInput[], header: HeaderDiscountInput = {}) {
  const lines = items.map(item => {
    const { gross, discount, net } = lineDiscount(item)
    const rate = Number(item.tva_rate || 0)
    const vat = roundMoney(net * rate / 100)
    return { gross, discount, net, vat, rate, total: roundMoney(net + vat) }
  })

  const lineExtension = roundMoney(lines.reduce((sum, line) => sum + line.net, 0))
  const headerAmount = Number(header.discount_amount || 0)
  const headerPercent = Number(header.discount_percent || 0)
  const headerDiscount = headerAmount > 0
    ? Math.min(headerAmount, lineExtension)
    : roundMoney(lineExtension * headerPercent / 100)
  const taxExclusive = roundMoney(lineExtension - headerDiscount)
  const factor = lineExtension > 0 ? taxExclusive / lineExtension : 1

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
  const prepaid = Math.min(Math.max(Number(header.prepaid_amount || 0), 0), taxInclusive)
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

export function remainingOf(invoice: {
  total?: number | null
  amount_paid?: number | null
  prepaid_amount?: number | null
}) {
  return Math.max(
    0,
    roundMoney(
      Number(invoice.total || 0) - Number(invoice.prepaid_amount || 0) - Number(invoice.amount_paid || 0)
    )
  )
}
