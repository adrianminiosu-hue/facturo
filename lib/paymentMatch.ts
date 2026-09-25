import { ibansEqual } from '@/lib/iban'
import { paymentFingerprint, type ParsedBankTxn } from '@/lib/multicash940'
import { stripDiacritics } from '@/lib/romania'
import { remainingOf, withConvertedInvoiceAmounts } from '@/lib/invoiceMath'
import { isOpenReceivable } from '@/lib/invoiceStatus'
import { formatAmount, formatRon } from '@/lib/money'

export { remainingOf }

export type MatchStatus = 'matched' | 'suggested' | 'unmatched' | 'duplicate' | 'skipped'

export type OpenInvoice = {
  id: string
  company_id: string | null
  client_id: string | null
  series: string
  invoice_number: string
  due_date: string | null
  issue_date: string | null
  total: number
  amount_paid: number
  prepaid_amount: number
  status: string
  currency: string | null
  invoice_type_code: string | null
  client_name: string
  client_cui: string
  client_iban: string
}

export type ExistingPayment = {
  id: string
  invoice_id: string | null
  amount: number
  paid_on: string
  reference?: string | null
  fingerprint?: string | null
  bank_txn_id?: string | null
  counterpart_iban?: string | null
  method?: string | null
}

export type MatchRow = {
  lineId: string
  status: MatchStatus
  confidence: number
  reasons: string[]
  warnings: string[]
  proposedInvoiceId: string | null
  proposedInvoiceRef: string | null
  proposedClientName: string | null
  amount: number
  currency: string
  paidOn: string
  counterpartName: string | null
  counterpartIban: string | null
  counterpartCui: string | null
  details: string
  bankTxnId: string | null
  reference: string | null
  statementIban: string
  fingerprint: string
  skipReason: string | null
}

const LEGAL_NOISE = new Set([
  'SRL', 'SA', 'PFA', 'PF', 'SC', 'SCA', 'SNC', 'RA', 'COM', 'COMPANY', 'LTD',
  'SRLD', 'II', 'IF', 'ONG', 'ASOC', 'ASSOCIATIA', 'FUNDATIA'
])

export function invoiceRef(invoice: Pick<OpenInvoice, 'series' | 'invoice_number'>) {
  return `${invoice.series || ''}${invoice.invoice_number || ''}`
}

function normalizeCui(value?: string | null) {
  return String(value || '').toUpperCase().replace(/\s/g, '').replace(/^RO/, '')
}

function tokens(value: string) {
  return stripDiacritics(value)
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length > 1 && !LEGAL_NOISE.has(t))
}

function nameScore(a?: string | null, b?: string | null) {
  const left = tokens(a || '')
  const right = tokens(b || '')
  if (!left.length || !right.length) return 0
  const rightSet = new Set(right)
  const inter = left.filter(t => rightSet.has(t)).length
  return inter / Math.max(left.length, right.length)
}

function invoiceKeys(invoice: OpenInvoice) {
  const series = stripDiacritics(invoice.series || '').replace(/\s/g, '')
  const rawNum = String(invoice.invoice_number || '').trim()
  const digits = rawNum.replace(/\D/g, '')
  const unpadded = digits.replace(/^0+/, '') || digits
  const keys = new Set<string>()
  const combos = [
    `${series}${rawNum}`,
    `${series}${digits}`,
    `${series}${unpadded}`,
    `${series}-${unpadded}`,
    `${series} ${unpadded}`
  ]
  for (const key of combos) {
    const compact = stripDiacritics(key).replace(/\s/g, '')
    if (compact.length >= 3) keys.add(compact)
  }
  if (unpadded) keys.add(unpadded)
  return { series, unpadded, keys }
}

function haystackOf(txn: ParsedBankTxn) {
  return stripDiacritics([
    txn.details,
    txn.reference,
    txn.bankTxnId,
    txn.counterpartName
  ].filter(Boolean).join(' '))
}

function invoiceNumberHit(txn: ParsedBankTxn, invoice: OpenInvoice) {
  const hay = haystackOf(txn).replace(/\s/g, '')
  const spaced = haystackOf(txn)
  const { series, unpadded, keys } = invoiceKeys(invoice)
  if (!hay) return 0
  for (const key of keys) {
    if (key.length >= 5 && hay.includes(key)) return 55
  }
  if (series && unpadded && new RegExp(`\\b${series}\\s*-?\\s*0*${unpadded}\\b`).test(spaced)) {
    return 50
  }
  if (unpadded && unpadded.length >= 3) {
    const fact = new RegExp(`\\bFACT(?:URA)?\\s*(?:NR\\.?|NUMARUL)?\\s*(?:${series})?\\s*-?\\s*0*${unpadded}\\b`)
    if (fact.test(spaced)) return 48
    if (series && hay.includes(`${series}${unpadded}`)) return 45
  }
  return 0
}

function isDuplicate(txn: ParsedBankTxn, fingerprint: string, existing: ExistingPayment[]) {
  const paidOn = txn.bookingDate || txn.valueDate || txn.statementDate || ''
  for (const row of existing) {
    if (row.fingerprint && row.fingerprint === fingerprint) return true
    if (txn.bankTxnId && row.bank_txn_id && row.bank_txn_id === txn.bankTxnId) return true
    if (txn.bankTxnId && row.reference && row.reference === txn.bankTxnId) return true
    const sameAmount = Math.abs(Number(row.amount) - txn.amount) < 0.009
    const sameDate = row.paid_on === paidOn
    const sameIban = txn.counterpartIban && row.counterpart_iban && ibansEqual(txn.counterpartIban, row.counterpart_iban)
    if (sameAmount && sameDate && sameIban) return true
  }
  return false
}

function scoreInvoice(txn: ParsedBankTxn, invoice: OpenInvoice, uniqueAmount: boolean) {
  const reasons: string[] = []
  const warnings: string[] = []
  let score = 0
  const rest = remainingOf(invoice)
  const numberHit = invoiceNumberHit(txn, invoice)
  if (numberHit) {
    score += numberHit
    reasons.push(`Număr factură ${invoiceRef(invoice)} în detaliile plății`)
  }
  if (txn.counterpartIban && invoice.client_iban && ibansEqual(txn.counterpartIban, invoice.client_iban)) {
    score += 25
    reasons.push('IBAN plătitor = IBAN client')
  }
  const txnCui = normalizeCui(txn.counterpartCui)
  const clientCui = normalizeCui(invoice.client_cui)
  if (txnCui && clientCui && txnCui === clientCui) {
    score += 20
    reasons.push('CUI găsit în extras')
  } else if (clientCui && haystackOf(txn).replace(/\s/g, '').includes(clientCui)) {
    score += 18
    reasons.push('CUI client în detaliile plății')
  }
  const names = nameScore(txn.counterpartName, invoice.client_name)
  if (names >= 0.7) {
    score += 15
    reasons.push('Nume plătitor aproape identic cu clientul')
  } else if (names >= 0.45) {
    score += 8
    reasons.push('Nume plătitor similar cu clientul')
  }
  if (Math.abs(txn.amount - rest) < 0.009) {
    score += uniqueAmount ? 22 : 16
    reasons.push(uniqueAmount ? 'Sumă unică egală cu restul de plată' : 'Sumă egală cu restul de plată')
  } else if (Number(invoice.amount_paid || 0) < 0.009 && Math.abs(txn.amount - Number(invoice.total)) < 0.009) {
    score += 12
    reasons.push('Sumă egală cu totalul facturii')
  } else if (txn.amount < rest - 0.009 && (numberHit || names >= 0.45 || (txnCui && txnCui === clientCui))) {
    score += 6
    reasons.push('Sumă parțială față de restul facturii')
    warnings.push('Încasarea este mai mică decât restul — se va înregistra ca plată parțială.')
  }
  if (txn.amount > rest + 0.009) {
    warnings.push(`Suma din extras (${formatAmount(txn.amount)}) depășește restul facturii (${formatAmount(rest)}).`)
    score = Math.min(score, 45)
  }
  return { score: Math.min(100, score), reasons, warnings, rest }
}

export function asOpenInvoice(row: Record<string, unknown>): OpenInvoice {
  const billed = withConvertedInvoiceAmounts(row as typeof row & { invoice_items?: Array<{ quantity?: number; unit_price?: number; tva_rate?: number; total?: number }> })
  const raw = billed.clients
  const client = (Array.isArray(raw) ? raw[0] : raw || {}) as Record<string, unknown>
  return {
    id: String(billed.id),
    company_id: billed.company_id ? String(billed.company_id) : null,
    client_id: billed.client_id ? String(billed.client_id) : null,
    series: String(billed.series || ''),
    invoice_number: String(billed.invoice_number || ''),
    due_date: billed.due_date ? String(billed.due_date) : null,
    issue_date: billed.issue_date ? String(billed.issue_date) : null,
    total: Number(billed.total || 0),
    amount_paid: Number(billed.amount_paid || 0),
    prepaid_amount: Number(billed.prepaid_amount || 0),
    status: String(billed.status || ''),
    currency: billed.currency ? String(billed.currency) : 'RON',
    invoice_type_code: billed.invoice_type_code ? String(billed.invoice_type_code) : '380',
    client_name: String(client.company_name || ''),
    client_cui: String(client.cui || ''),
    client_iban: String(client.iban || '')
  }
}

type Scored = { invoice: OpenInvoice; score: number; reasons: string[]; warnings: string[]; numberHit: number }

function bestForTxn(txn: ParsedBankTxn, invoices: OpenInvoice[], claimed: Set<string>): Scored | null {
  const candidates = invoices.filter(inv => !claimed.has(inv.id) && txn.amount <= remainingOf(inv) + 0.009)
  const amountHits = candidates.filter(inv => Math.abs(remainingOf(inv) - txn.amount) < 0.009)
  let best: Scored | null = null
  for (const invoice of candidates) {
    const uniqueAmount = amountHits.length === 1 && amountHits[0].id === invoice.id
    const scored = scoreInvoice(txn, invoice, uniqueAmount)
    const numberHit = invoiceNumberHit(txn, invoice)
    const row: Scored = { invoice, score: scored.score, reasons: scored.reasons, warnings: scored.warnings, numberHit }
    if (!best || row.score > best.score || (row.score === best.score && (invoice.due_date || '9999') < (best.invoice.due_date || '9999'))) {
      best = row
    }
  }
  return best
}

function rowFromScore(txn: ParsedBankTxn, fingerprint: string, paidOn: string, scored: Scored | null): MatchRow {
  if (scored && scored.score >= 70) {
    return baseRow(txn, fingerprint, paidOn, {
      status: 'matched',
      confidence: scored.score,
      reasons: scored.reasons,
      warnings: scored.warnings,
      proposedInvoiceId: scored.invoice.id,
      proposedInvoiceRef: invoiceRef(scored.invoice),
      proposedClientName: scored.invoice.client_name || null
    })
  }
  if (scored && scored.score >= 40) {
    return baseRow(txn, fingerprint, paidOn, {
      status: 'suggested',
      confidence: scored.score,
      reasons: scored.reasons,
      warnings: scored.warnings,
      proposedInvoiceId: scored.invoice.id,
      proposedInvoiceRef: invoiceRef(scored.invoice),
      proposedClientName: scored.invoice.client_name || null
    })
  }
  return baseRow(txn, fingerprint, paidOn, {
    status: 'unmatched',
    confidence: scored?.score || 0,
    reasons: scored?.reasons || [],
    warnings: scored?.warnings || [],
    proposedInvoiceId: null,
    proposedInvoiceRef: null,
    proposedClientName: txn.counterpartName
  })
}

export function matchPayments(opts: {
  txns: ParsedBankTxn[]
  invoices: OpenInvoice[]
  existing: ExistingPayment[]
  companyIban: string
}): { rows: MatchRow[]; ibanMismatch: boolean; ibanWarning: string | null } {
  const { txns, existing, companyIban } = opts
  const invoices = opts.invoices
    .filter(inv => isOpenReceivable(inv.status))
    .filter(inv => inv.invoice_type_code !== '381')
    .filter(inv => remainingOf(inv) > 0.009)
    .slice()
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))

  const rowsByLine = new Map<string, MatchRow>()
  const pending: { txn: ParsedBankTxn; fingerprint: string; paidOn: string }[] = []
  const seenFingerprints = new Set<string>()
  let ibanMismatch = false
  let ibanWarning: string | null = null

  for (const txn of txns) {
    const paidOn = txn.bookingDate || txn.valueDate || txn.statementDate || ''
    const fingerprint = paymentFingerprint({
      statementIban: txn.statementIban,
      paidOn,
      amount: txn.amount,
      counterpartIban: txn.counterpartIban || '',
      bankTxnId: txn.bankTxnId || '',
      details: txn.details
    })

    if (companyIban && txn.statementIban && txn.direction === 'credit' && !ibansEqual(companyIban, txn.statementIban)) {
      ibanMismatch = true
      ibanWarning = `IBAN extras (${txn.statementIban}) diferă de IBAN-ul firmei active (${companyIban}). Poți importa după confirmare.`
    }

    if (txn.skipReason || txn.direction !== 'credit') {
      rowsByLine.set(txn.lineId, {
        lineId: txn.lineId,
        status: 'skipped',
        confidence: 0,
        reasons: [],
        warnings: [],
        proposedInvoiceId: null,
        proposedInvoiceRef: null,
        proposedClientName: null,
        amount: txn.amount,
        currency: txn.currency,
        paidOn,
        counterpartName: txn.counterpartName,
        counterpartIban: txn.counterpartIban,
        counterpartCui: txn.counterpartCui,
        details: txn.details,
        bankTxnId: txn.bankTxnId,
        reference: txn.reference,
        statementIban: txn.statementIban,
        fingerprint,
        skipReason: txn.skipReason || 'Nu este o încasare.'
      })
      continue
    }

    if (!paidOn) {
      rowsByLine.set(txn.lineId, baseRow(txn, fingerprint, paidOn, {
        status: 'unmatched',
        confidence: 0,
        reasons: [],
        warnings: ['Lipsește data tranzacției.'],
        skipReason: null
      }))
      continue
    }

    if (isDuplicate(txn, fingerprint, existing) || seenFingerprints.has(fingerprint)) {
      rowsByLine.set(txn.lineId, baseRow(txn, fingerprint, paidOn, {
        status: 'duplicate',
        confidence: 100,
        reasons: ['Tranzacție deja importată (aceeași referință / sumă / dată / IBAN).'],
        warnings: [],
        skipReason: 'Duplicat — nu se mai importă.'
      }))
      continue
    }
    seenFingerprints.add(fingerprint)

    pending.push({ txn, fingerprint, paidOn })
  }

  const claimed = new Set<string>()
  const assigned = new Set<string>()

  const assignIf = (predicate: (txn: ParsedBankTxn, scored: Scored) => boolean) => {
    for (const item of pending) {
      if (assigned.has(item.txn.lineId)) continue
      const scored = bestForTxn(item.txn, invoices, claimed)
      if (!scored || !predicate(item.txn, scored)) continue
      claimed.add(scored.invoice.id)
      assigned.add(item.txn.lineId)
      rowsByLine.set(item.txn.lineId, rowFromScore(item.txn, item.fingerprint, item.paidOn, scored))
    }
  }

  assignIf((_txn, scored) => scored.numberHit >= 45 && scored.score >= 70)
  assignIf((txn, scored) => scored.score >= 70 && Math.abs(remainingOf(scored.invoice) - txn.amount) < 0.009)
  assignIf((_txn, scored) => scored.score >= 70)
  assignIf((_txn, scored) => scored.score >= 40)

  for (const item of pending) {
    if (assigned.has(item.txn.lineId)) continue
    const scored = bestForTxn(item.txn, invoices, claimed)
    rowsByLine.set(item.txn.lineId, rowFromScore(item.txn, item.fingerprint, item.paidOn, scored))
  }

  const rows = txns.map(txn => rowsByLine.get(txn.lineId)).filter((row): row is MatchRow => !!row)
  return { rows, ibanMismatch, ibanWarning }
}

function baseRow(
  txn: ParsedBankTxn,
  fingerprint: string,
  paidOn: string,
  extra: Partial<MatchRow> & Pick<MatchRow, 'status' | 'confidence' | 'reasons' | 'warnings'>
): MatchRow {
  return {
    lineId: txn.lineId,
    proposedInvoiceId: extra.proposedInvoiceId || null,
    proposedInvoiceRef: extra.proposedInvoiceRef || null,
    proposedClientName: extra.proposedClientName || null,
    amount: txn.amount,
    currency: txn.currency,
    paidOn,
    counterpartName: txn.counterpartName,
    counterpartIban: txn.counterpartIban,
    counterpartCui: txn.counterpartCui,
    details: txn.details,
    bankTxnId: txn.bankTxnId,
    reference: txn.reference,
    statementIban: txn.statementIban,
    fingerprint,
    skipReason: extra.skipReason || null,
    ...extra
  }
}

export function openInvoiceSelectLabel(invoice: OpenInvoice) {
  const rest = formatAmount(remainingOf(invoice))
  return `${invoiceRef(invoice)} · ${invoice.client_name || 'Client'} · rest ${rest} RON`
}
