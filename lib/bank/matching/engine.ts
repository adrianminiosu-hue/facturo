import {
  AUTO_APPLY_THRESHOLD,
  DUPLICATE_REF_MAX_CONFIDENCE,
  NEAR_AMOUNT_MAX_BANI,
  NEAR_AMOUNT_MAX_RATIO,
  RULE,
  SUBSET_MAX_INVOICES,
  SUBSET_MAX_SIZE
} from '@/lib/bank/matching/constants'
import { extractInvoiceRefs } from '@/lib/bank/matching/extractRefs'
import { invoiceKey, namesSimilar, normalizeInvoiceNumber, normalizePartyName, sameIban } from '@/lib/bank/matching/normalize'
import type {
  EngineInput,
  MatchCandidate,
  MatchInvoice,
  LearnedRule
} from '@/lib/bank/matching/types'

/**
 * How sure we are about who paid. It caps the confidence of every amount-based rule:
 * a known IBAN is as good as a signature, a CUI in the text or a learned name is strong,
 * a similar company name alone is only a hint.
 */
type PayerEvidence = 'iban' | 'cui' | 'rule_name' | 'name'

function byOldest(a: MatchInvoice, b: MatchInvoice) {
  return String(a.issue_date || a.due_date || '').localeCompare(String(b.issue_date || b.due_date || ''))
}

function withAuto(candidate: Omit<MatchCandidate, 'auto'>): MatchCandidate {
  return { ...candidate, auto: candidate.confidence >= AUTO_APPLY_THRESHOLD }
}

function allocateExact(invoices: MatchInvoice[]): MatchCandidate['allocations'] {
  return invoices.map(invoice => ({ invoiceId: invoice.id, amount_bani: invoice.remaining_bani }))
}

/** Pays the invoices oldest first until the money runs out. */
function allocateOldestFirst(invoices: MatchInvoice[], amount: number): MatchCandidate['allocations'] {
  const out: MatchCandidate['allocations'] = []
  let left = amount
  for (const invoice of [...invoices].sort(byOldest)) {
    if (left <= 0) break
    const take = Math.min(left, invoice.remaining_bani)
    out.push({ invoiceId: invoice.id, amount_bani: take })
    left -= take
  }
  return out
}

function sum(invoices: MatchInvoice[]) {
  return invoices.reduce((total, invoice) => total + invoice.remaining_bani, 0)
}

function cuiDigits(value?: string | null) {
  return String(value || '').replace(/\s/g, '').replace(/^RO/i, '').replace(/\D/g, '')
}

function mentionsCui(hay: string, cui: string) {
  if (cui.length < 4) return false
  return new RegExp(`(?:^|\\D)(?:RO)?${cui}(?:\\D|$)`).test(hay)
}

/** Who the counterparty is, with the strongest evidence found for each client. */
function payersForTransaction(
  txnIban: string,
  txnName: string,
  description: string,
  invoices: MatchInvoice[],
  rules: LearnedRule[]
) {
  const rank: Record<PayerEvidence, number> = { iban: 4, cui: 3, rule_name: 2, name: 1 }
  const found = new Map<string, PayerEvidence>()
  const note = (clientId: string | null | undefined, evidence: PayerEvidence) => {
    if (!clientId) return
    const seen = found.get(clientId)
    if (!seen || rank[evidence] > rank[seen]) found.set(clientId, evidence)
  }
  const hay = `${description} ${txnName}`.toUpperCase()
  for (const invoice of invoices) {
    if (invoice.client_ibans.some(iban => sameIban(iban, txnIban))) note(invoice.client_id, 'iban')
    const cui = cuiDigits(invoice.client_cui)
    if (cui && mentionsCui(hay, cui)) note(invoice.client_id, 'cui')
  }
  const txnNameNorm = normalizePartyName(txnName)
  for (const rule of rules) {
    if (rule.counterparty_iban && sameIban(rule.counterparty_iban, txnIban)) note(rule.client_id, 'iban')
    if (rule.counterparty_name_norm && txnNameNorm && txnNameNorm === rule.counterparty_name_norm) note(rule.client_id, 'rule_name')
  }

  // Nothing solid: fall back to the company name, but only when exactly one client fits it.
  if (found.size === 0 && txnNameNorm) {
    const byName = new Set<string>()
    for (const invoice of invoices) {
      if (invoice.client_id && namesSimilar(invoice.client_name, txnName)) byName.add(invoice.client_id)
    }
    if (byName.size === 1) note([...byName][0], 'name')
  }

  // Keep only the strongest tier: an IBAN hit outranks a name that happens to fit someone else too.
  const best = Math.max(0, ...[...found.values()].map(evidence => rank[evidence]))
  return [...found.entries()].filter(([, evidence]) => rank[evidence] === best)
}

function invoicesForClient(invoices: MatchInvoice[], clientId: string) {
  return invoices.filter(invoice => invoice.client_id === clientId && invoice.remaining_bani > 0).sort(byOldest)
}

/**
 * Combinations of open invoices that add up exactly to the amount (at most two are reported,
 * which is enough to know whether the answer is unique). Oldest invoices are tried first.
 */
function exactSubsets(invoices: MatchInvoice[], amount: number, minSize = 2) {
  const pool = invoices.slice(0, SUBSET_MAX_INVOICES)
  const found: MatchInvoice[][] = []
  const pick: MatchInvoice[] = []
  const suffix: number[] = new Array(pool.length + 1).fill(0)
  for (let i = pool.length - 1; i >= 0; i -= 1) suffix[i] = suffix[i + 1] + pool[i].remaining_bani
  const walk = (start: number, left: number) => {
    if (found.length >= 2) return
    if (left === 0) {
      if (pick.length >= minSize) found.push([...pick])
      return
    }
    if (pick.length >= SUBSET_MAX_SIZE || left < 0 || suffix[start] < left) return
    for (let i = start; i < pool.length && found.length < 2; i += 1) {
      pick.push(pool[i])
      walk(i + 1, left - pool[i].remaining_bani)
      pick.pop()
    }
  }
  walk(0, amount)
  return found
}

function nearAmount(invoice: MatchInvoice, amount: number) {
  const gap = invoice.remaining_bani - amount
  return gap > 0 && gap <= NEAR_AMOUNT_MAX_BANI && gap <= invoice.remaining_bani * NEAR_AMOUNT_MAX_RATIO
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
  const byNumber = new Map<string, MatchInvoice[]>()
  for (const invoice of invoices) {
    const key = invoiceKey(invoice.series, invoice.invoice_number)
    byKey.set(key, [...(byKey.get(key) || []), invoice])
    const number = normalizeInvoiceNumber(invoice.invoice_number)
    byNumber.set(number, [...(byNumber.get(number) || []), invoice])
  }

  const payers = payersForTransaction(
    transaction.counterparty_iban,
    transaction.counterparty_name,
    transaction.description,
    invoices,
    rules
  )
  const payerIds = new Set(payers.map(([clientId]) => clientId))

  const resolved: MatchInvoice[] = []
  let duplicateRef = false
  const hitsFor = (ref: (typeof refs)[number]) => {
    const exact = byKey.get(invoiceKey(ref.series, ref.number)) || []
    if (exact.length || !ref.anySeries) return exact
    // "FACTURA NR 31" with no series: any series works, as long as it is not ambiguous.
    const any = byNumber.get(ref.number) || []
    if (any.length <= 1) return any
    const ofPayer = any.filter(invoice => invoice.client_id && payerIds.has(invoice.client_id))
    return ofPayer.length === 1 ? ofPayer : any
  }
  for (const ref of refs.filter(item => !item.listed)) {
    const hits = hitsFor(ref)
    if (hits.length > 1) duplicateRef = true
    for (const hit of hits) {
      if (!resolved.some(item => item.id === hit.id)) resolved.push(hit)
    }
  }
  // "FCT18, 19": the listed 19 only counts if it belongs to the client of the direct reference.
  const refClients = new Set(resolved.map(invoice => invoice.client_id).filter(Boolean))
  for (const ref of refs.filter(item => item.listed)) {
    const hits = hitsFor(ref).filter(hit => refClients.has(hit.client_id))
    if (hits.length === 1 && !resolved.some(item => item.id === hits[0].id)) resolved.push(hits[0])
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

  /** Paid more than the referenced invoices: maybe other invoices of the same client make up the rest. */
  const refPlusOthers = (referenced: MatchInvoice[]) => {
    const clientId = referenced[0]?.client_id
    if (!clientId || referenced.some(invoice => invoice.client_id !== clientId)) return null
    const others = invoicesForClient(invoices, clientId).filter(invoice => !referenced.some(ref => ref.id === invoice.id))
    const combos = exactSubsets(others, absAmount - sum(referenced), 1)
    if (combos.length !== 1) return null
    return withAuto({
      allocations: allocateExact([...referenced, ...combos[0]]),
      confidence: 85,
      rule: RULE.invoiceRefMulti,
      overpayment_bani: 0
    })
  }

  /** A real overpayment is small next to the invoice; paying double is far more often a second invoice. */
  const overpaymentConfidence = (paid: number, due: number) => (paid - due <= Math.max(100, due * 0.05) ? 90 : 70)

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
    const combined = refPlusOthers([invoice])
    if (combined) return combined
    return withAuto({
      allocations: allocateExact([invoice]),
      confidence: overpaymentConfidence(absAmount, invoice.remaining_bani),
      rule: RULE.overpayment,
      overpayment_bani: absAmount - invoice.remaining_bani
    })
  }

  if (resolved.length > 1) {
    const remainingSum = sum(resolved)
    if (absAmount === remainingSum) {
      return withAuto({
        allocations: allocateExact(resolved),
        confidence: 97,
        rule: RULE.invoiceRefMulti,
        overpayment_bani: 0
      })
    }
    if (absAmount > remainingSum) {
      const combined = refPlusOthers(resolved)
      if (combined) return combined
      return withAuto({
        allocations: allocateExact(resolved),
        confidence: overpaymentConfidence(absAmount, remainingSum),
        rule: RULE.overpayment,
        overpayment_bani: absAmount - remainingSum
      })
    }
    // Less than the referenced invoices: an advance or an instalment. Oldest first, one click to confirm.
    return withAuto({
      allocations: allocateOldestFirst(resolved, absAmount),
      confidence: 85,
      rule: RULE.invoiceRefPartial,
      overpayment_bani: 0
    })
  }

  if (payers.length === 1) {
    const [clientId, evidence] = payers[0]
    const clientInvoices = invoicesForClient(invoices, clientId)
    const strong = evidence === 'iban'
    const exactConfidence = { iban: 92, cui: 88, rule_name: 85, name: 80 }[evidence]

    const exactOne = clientInvoices.filter(invoice => invoice.remaining_bani === absAmount)
    if (exactOne.length === 1) {
      return withAuto({
        allocations: allocateExact(exactOne),
        confidence: exactConfidence,
        rule: strong ? RULE.ibanAmount : RULE.nameAmount,
        overpayment_bani: 0
      })
    }
    if (exactOne.length > 1) {
      // Same amount twice (a monthly subscription): the oldest is the one being paid, but ask.
      return withAuto({
        allocations: allocateExact([exactOne[0]]),
        confidence: 75,
        rule: strong ? RULE.ibanAmount : RULE.nameAmount,
        overpayment_bani: 0
      })
    }

    const combos = exactSubsets(clientInvoices, absAmount)
    if (combos.length) {
      const unique = combos.length === 1
      const contiguous = clientInvoices.slice(0, combos[0].length).every((invoice, index) => invoice.id === combos[0][index]?.id)
      const confidence = unique && strong && combos[0].length <= 4 ? 90 : unique || contiguous ? 75 : 60
      return withAuto({
        allocations: allocateExact(combos[0]),
        confidence,
        rule: RULE.multiInvoice,
        overpayment_bani: 0
      })
    }

    const near = clientInvoices.filter(invoice => nearAmount(invoice, absAmount))
    if (near.length === 1) {
      return withAuto({
        allocations: [{ invoiceId: near[0].id, amount_bani: absAmount }],
        confidence: Math.min(exactConfidence - 10, 80),
        rule: RULE.amountNear,
        overpayment_bani: 0
      })
    }

    // A name alone is not enough to book money against whatever invoice happens to be oldest.
    if (clientInvoices[0] && evidence !== 'name') {
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
