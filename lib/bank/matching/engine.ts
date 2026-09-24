import { AUTO_APPLY_THRESHOLD, DUPLICATE_REF_MAX_CONFIDENCE, RULE } from '@/lib/bank/matching/constants'
import { extractInvoiceRefs } from '@/lib/bank/matching/extractRefs'
import { invoiceKey, namesSimilar, normalizePartyName, sameIban } from '@/lib/bank/matching/normalize'
import type {
  EngineInput,
  MatchCandidate,
  MatchInvoice,
  LearnedRule
} from '@/lib/bank/matching/types'

function byOldest(a: MatchInvoice, b: MatchInvoice) {
  return String(a.issue_date || a.due_date || '').localeCompare(String(b.issue_date || b.due_date || ''))
}

function withAuto(candidate: Omit<MatchCandidate, 'auto'>): MatchCandidate {
  return { ...candidate, auto: candidate.confidence >= AUTO_APPLY_THRESHOLD }
}

function allocateExact(invoices: MatchInvoice[]): MatchCandidate['allocations'] {
  return invoices.map(invoice => ({ invoiceId: invoice.id, amount_bani: invoice.remaining_bani }))
}

function clientIdsForCounterparty(
  txnIban: string,
  txnName: string,
  description: string,
  invoices: MatchInvoice[],
  rules: LearnedRule[]
) {
  const ids = new Set<string>()
  const hay = `${description} ${txnName}`.toUpperCase()
  for (const invoice of invoices) {
    if (invoice.client_ibans.some(iban => sameIban(iban, txnIban))) {
      if (invoice.client_id) ids.add(invoice.client_id)
    }
    const cui = String(invoice.client_cui || '').replace(/\s/g, '').replace(/^RO/i, '')
    if (cui && hay.includes(cui)) {
      if (invoice.client_id) ids.add(invoice.client_id)
    }
  }
  for (const rule of rules) {
    if (rule.counterparty_iban && sameIban(rule.counterparty_iban, txnIban) && rule.client_id) {
      ids.add(rule.client_id)
    }
    if (rule.counterparty_name_norm && normalizePartyName(txnName) === rule.counterparty_name_norm && rule.client_id) {
      ids.add(rule.client_id)
    }
  }
  return [...ids]
}

function invoicesForClient(invoices: MatchInvoice[], clientId: string) {
  return invoices.filter(invoice => invoice.client_id === clientId && invoice.remaining_bani > 0).sort(byOldest)
}

export function matchBankTransaction(input: EngineInput): MatchCandidate | null {
  const { transaction, seriesList, defaultSeries, rules } = input
  const absAmount = Math.abs(transaction.amount_bani)
  if (!absAmount) return null
  const direction: MatchInvoice['direction'] = transaction.amount_bani < 0 ? 'purchase' : 'issued'
  const invoices = input.invoices.filter(invoice => {
    if (invoice.direction !== direction) return false
    if (invoice.remaining_bani <= 0) return false
    if (transaction.currency && invoice.currency && invoice.currency !== transaction.currency) return false
    return true
  })
  if (invoices.length === 0) return null

  const text = `${transaction.description || ''} ${transaction.counterparty_name || ''}`
  const refs = extractInvoiceRefs(text, seriesList.length ? seriesList : [defaultSeries], defaultSeries)
  const byKey = new Map<string, MatchInvoice[]>()
  for (const invoice of invoices) {
    const key = invoiceKey(invoice.series, invoice.invoice_number)
    const list = byKey.get(key) || []
    list.push(invoice)
    byKey.set(key, list)
  }

  const resolved: MatchInvoice[] = []
  let duplicateRef = false
  for (const ref of refs) {
    const hits = byKey.get(invoiceKey(ref.series, ref.number)) || []
    if (hits.length > 1) duplicateRef = true
    for (const hit of hits) {
      if (!resolved.some(item => item.id === hit.id)) resolved.push(hit)
    }
  }

  if (duplicateRef && resolved.length) {
    const exact = resolved.filter(invoice => invoice.remaining_bani === absAmount)
    const chosen = exact.length ? exact : resolved
    return withAuto({
      allocations: chosen.map(invoice => ({
        invoiceId: invoice.id,
        amount_bani: Math.min(absAmount, invoice.remaining_bani)
      })),
      confidence: DUPLICATE_REF_MAX_CONFIDENCE,
      rule: RULE.duplicateRef,
      overpayment_bani: 0
    })
  }

  if (resolved.length === 1) {
    const invoice = resolved[0]
    if (absAmount === invoice.remaining_bani) {
      return withAuto({
        allocations: allocateExact([invoice]),
        confidence: 98,
        rule: RULE.invoiceRef,
        overpayment_bani: 0
      })
    }
    if (absAmount < invoice.remaining_bani) {
      return withAuto({
        allocations: [{ invoiceId: invoice.id, amount_bani: absAmount }],
        confidence: 90,
        rule: RULE.invoiceRefPartial,
        overpayment_bani: 0
      })
    }
    return withAuto({
      allocations: allocateExact([invoice]),
      confidence: 90,
      rule: RULE.overpayment,
      overpayment_bani: absAmount - invoice.remaining_bani
    })
  }

  if (resolved.length > 1) {
    const remainingSum = resolved.reduce((sum, invoice) => sum + invoice.remaining_bani, 0)
    if (absAmount === remainingSum) {
      return withAuto({
        allocations: allocateExact(resolved),
        confidence: 97,
        rule: RULE.invoiceRefMulti,
        overpayment_bani: 0
      })
    }
    if (absAmount > remainingSum) {
      return withAuto({
        allocations: allocateExact(resolved),
        confidence: 90,
        rule: RULE.overpayment,
        overpayment_bani: absAmount - remainingSum
      })
    }
  }

  const clientIds = clientIdsForCounterparty(
    transaction.counterparty_iban,
    transaction.counterparty_name,
    transaction.description,
    invoices,
    rules
  )

  if (clientIds.length === 1) {
    const clientInvoices = invoicesForClient(invoices, clientIds[0])
    const ibanKnown = clientInvoices.some(invoice => invoice.client_ibans.some(iban => sameIban(iban, transaction.counterparty_iban)))
      || rules.some(rule => rule.client_id === clientIds[0] && sameIban(rule.counterparty_iban, transaction.counterparty_iban))
    const exactOne = clientInvoices.filter(invoice => invoice.remaining_bani === absAmount)
    if (ibanKnown && exactOne.length === 1) {
      return withAuto({
        allocations: allocateExact(exactOne),
        confidence: 90,
        rule: RULE.ibanAmount,
        overpayment_bani: 0
      })
    }

    for (let count = 2; count <= Math.min(5, clientInvoices.length); count += 1) {
      const slice = clientInvoices.slice(0, count)
      const sum = slice.reduce((total, invoice) => total + invoice.remaining_bani, 0)
      if (sum === absAmount) {
        return withAuto({
          allocations: allocateExact(slice),
          confidence: 75,
          rule: RULE.multiInvoice,
          overpayment_bani: 0
        })
      }
    }

    if (clientInvoices[0]) {
      const oldest = clientInvoices[0]
      const amount = Math.min(absAmount, oldest.remaining_bani)
      return withAuto({
        allocations: [{ invoiceId: oldest.id, amount_bani: amount }],
        confidence: 60,
        rule: RULE.partialOldest,
        overpayment_bani: Math.max(0, absAmount - oldest.remaining_bani)
      })
    }
  }

  const nameHits = invoices.filter(invoice =>
    invoice.remaining_bani === absAmount && namesSimilar(invoice.client_name, transaction.counterparty_name)
  )
  if (nameHits.length === 1) {
    return withAuto({
      allocations: allocateExact(nameHits),
      confidence: 45,
      rule: RULE.nameAmount,
      overpayment_bani: 0
    })
  }

  return null
}
