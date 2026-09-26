import { at, kids, numAt, textAt, type XmlNode } from '@/lib/xmlTree'
import { cuiDigits, splitInvoiceId, type UblInvoice, type UblLine, type UblParty } from '@/lib/ublInvoice'

/**
 * Reads a UN/CEFACT Cross Industry Invoice (CII D16B, EN 16931 / CIUS-RO), the second syntax
 * ANAF accepts (upload standard=CII). Mapped onto the same shape as the UBL reader, so the
 * SPV import treats both the same way. Credit notes are TypeCode 381 with positive amounts.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** udt:DateTimeString format 102 ("20260921") → "2026-09-21". Already-ISO values pass through. */
export function ciiDate(node: XmlNode | undefined) {
  const raw = textAt(node, 'DateTimeString') || (node?.text || '').trim()
  const m = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

function party(node: XmlNode | undefined): UblParty {
  const taxIds = kids(node, 'SpecifiedTaxRegistration').map(t => ({
    id: textAt(t, 'ID'),
    scheme: (at(t, 'ID')?.attrs.schemeID || '').toUpperCase()
  })).filter(t => t.id)
  const vatId = taxIds.find(t => t.scheme === 'VA')?.id || taxIds.find(t => /^[A-Z]{2}/i.test(t.id))?.id || ''
  const legalId = textAt(node, 'SpecifiedLegalOrganization/ID')
  const fallbackId = taxIds[0]?.id || textAt(node, 'ID') || textAt(node, 'GlobalID') || textAt(node, 'URIUniversalCommunication/URIID')
  const address = at(node, 'PostalTradeAddress')
  const street = [textAt(address, 'LineOne'), textAt(address, 'LineTwo'), textAt(address, 'LineThree')].filter(Boolean).join(', ')
  return {
    name: textAt(node, 'Name') || textAt(node, 'SpecifiedLegalOrganization/TradingBusinessName'),
    cui: cuiDigits(vatId || legalId || fallbackId),
    vatId,
    address: street,
    city: textAt(address, 'CityName'),
    county: textAt(address, 'CountrySubDivisionName'),
    country: (textAt(address, 'CountryID') || 'RO').toUpperCase()
  }
}

/** A monetary summation element can appear once per currency (TaxTotalAmount in document currency and in RON). */
function amountIn(parent: XmlNode | undefined, name: string, currency: string) {
  const nodes = kids(parent, name)
  const match = nodes.find(n => (n.attrs.currencyID || currency).toUpperCase() === currency) || (nodes.length === 1 && !nodes[0].attrs.currencyID ? nodes[0] : undefined)
  const n = Number((match?.text || '').trim())
  return Number.isFinite(n) ? n : 0
}

function line(item: XmlNode): UblLine {
  const agreement = at(item, 'SpecifiedLineTradeAgreement')
  const delivery = at(item, 'SpecifiedLineTradeDelivery')
  const settlement = at(item, 'SpecifiedLineTradeSettlement')
  const qtyNode = at(delivery, 'BilledQuantity')
  const quantity = Number(qtyNode?.text.trim() || 0) || 0
  const priceNode = at(agreement, 'NetPriceProductTradePrice')
  const baseQty = numAt(priceNode, 'BasisQuantity') || 1
  const price = numAt(priceNode, 'ChargeAmount') / baseQty
  const net = numAt(settlement, 'SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount')
  const tax = at(settlement, 'ApplicableTradeTax')
  return {
    description: textAt(item, 'SpecifiedTradeProduct/Name') || textAt(item, 'SpecifiedTradeProduct/Description') || 'Articol',
    quantity,
    unitCode: qtyNode?.attrs.unitCode || 'H87',
    unitPrice: price || (quantity ? round2(net / quantity) : net),
    net,
    vatRate: numAt(tax, 'RateApplicablePercent'),
    vatCategory: textAt(tax, 'CategoryCode') || 'S'
  }
}

export function isCiiDocument(root: XmlNode) {
  return root.name === 'CrossIndustryInvoice'
}

export function parseCiiInvoice(root: XmlNode): UblInvoice {
  if (!isCiiDocument(root)) throw new Error(`Documentul nu este o factură CII (${root.name}).`)
  const doc = at(root, 'ExchangedDocument')
  const tx = at(root, 'SupplyChainTradeTransaction')
  const agreement = at(tx, 'ApplicableHeaderTradeAgreement')
  const settlement = at(tx, 'ApplicableHeaderTradeSettlement')
  const summary = at(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation')

  const id = textAt(doc, 'ID')
  const typeCode = textAt(doc, 'TypeCode') || '380'
  const currency = (textAt(settlement, 'InvoiceCurrencyCode') || 'RON').toUpperCase()
  const taxCurrency = textAt(settlement, 'TaxCurrencyCode').toUpperCase()
  const issueDate = ciiDate(at(doc, 'IssueDateTime'))
  const dueDate = kids(settlement, 'SpecifiedTradePaymentTerms').map(t => ciiDate(at(t, 'DueDateDateTime'))).find(Boolean) || issueDate

  const vat = amountIn(summary, 'TaxTotalAmount', currency)
  let fxRate: number | null = null
  if (currency !== 'RON' && taxCurrency === 'RON') {
    const vatRon = amountIn(summary, 'TaxTotalAmount', 'RON')
    if (vat > 0 && vatRon > 0) fxRate = Math.round((vatRon / vat) * 1e4) / 1e4
  }

  const { series, number } = splitInvoiceId(id)
  return {
    typeCode,
    isCreditNote: typeCode === '381',
    id,
    series,
    number,
    issueDate,
    dueDate,
    currency,
    fxRate,
    supplier: party(at(agreement, 'SellerTradeParty')),
    customer: party(at(agreement, 'BuyerTradeParty')),
    lines: kids(tx, 'IncludedSupplyChainTradeLineItem').map(line),
    totals: {
      net: amountIn(summary, 'TaxBasisTotalAmount', currency),
      vat,
      total: amountIn(summary, 'GrandTotalAmount', currency),
      prepaid: amountIn(summary, 'TotalPrepaidAmount', currency),
      payable: amountIn(summary, 'DuePayableAmount', currency)
    },
    notes: kids(doc, 'IncludedNote').map(n => textAt(n, 'Content')).filter(Boolean)
  }
}
