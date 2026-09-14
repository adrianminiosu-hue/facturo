import { createHash } from 'crypto'
import { extractIban, normalizeIban } from '@/lib/iban'
import {
  attr,
  child,
  directText,
  findAll,
  firstDescendantText,
  localName,
  parseXml,
  textContent,
  type XmlElement
} from '@/lib/xmlLite'

export type ParsedDirection = 'credit' | 'debit' | 'unknown'

export type ParsedBankTxn = {
  lineId: string
  direction: ParsedDirection
  amount: number
  currency: string
  bookingDate: string | null
  valueDate: string | null
  bankTxnId: string | null
  reference: string | null
  counterpartName: string | null
  counterpartIban: string | null
  counterpartCui: string | null
  details: string
  statementIban: string
  statementDate: string | null
  statementId: string | null
  reversal: boolean
  skipReason: string | null
}

export type ParsedStatement = {
  accountIban: string
  statementDate: string | null
  statementId: string | null
  currency: string
  transactions: ParsedBankTxn[]
}

export type MulticashParseOk = {
  ok: true
  statements: ParsedStatement[]
  credits: ParsedBankTxn[]
  skipped: ParsedBankTxn[]
  warnings: string[]
}

export type MulticashParseErr = {
  ok: false
  error: string
}

export type MulticashParseResult = MulticashParseOk | MulticashParseErr

const ENTRY_TAGS = new Set([
  'ntry',
  'transaction',
  'tranzactie',
  'trn',
  'linie',
  'movement',
  'entry',
  'rec',
  'stmtline',
  'operation',
  'operatiune'
])

const STATEMENT_TAGS = new Set([
  'stmt',
  'statement',
  'bankstatement',
  'extras',
  'extrascont',
  'contstatement'
])

function parseAmount(raw?: string | null): number | null {
  if (!raw) return null
  let text = String(raw).trim().replace(/\s/g, '').replace(/[^\d,.\-]/g, '')
  if (!text || text === '-' || text === '.' || text === ',') return null
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '')
  } else if (lastComma >= 0) {
    text = text.replace(',', '.')
  }
  const value = Number(text)
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

function parseDate(raw?: string | null): string | null {
  if (!raw) return null
  const text = String(raw).trim()
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const ymd = text.match(/\b(\d{4})(\d{2})(\d{2})\b/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const dmyCompact = text.match(/\b(\d{2})(\d{2})(\d{4})\b/)
  if (dmyCompact) return `${dmyCompact[3]}-${dmyCompact[2]}-${dmyCompact[1]}`
  return null
}

function attrMap(el: XmlElement) {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(el.attrs)) {
    out[localName(key)] = value
    out[key.toLowerCase()] = value
  }
  return out
}

function collectTexts(el: XmlElement, names: string[]) {
  const parts: string[] = []
  for (const name of names) {
    for (const node of findAll(el, name)) {
      const text = textContent(node)
      if (text) parts.push(text)
    }
  }
  return parts
}

function extractCui(value: string) {
  const text = value.toUpperCase().replace(/\s/g, '')
  const match = text.match(/RO[0-9]{6,10}\b/) || text.match(/\b[0-9]{6,10}\b/)
  return match ? match[0].replace(/^RO/, '') : ''
}

function looksLikeIban(value: string) {
  return !!extractIban(value)
}

function firstIban(el: XmlElement): string {
  for (const node of findAll(el, 'iban')) {
    const found = extractIban(textContent(node))
    if (found) return found
  }
  for (const node of findAll(el, 'id')) {
    const text = textContent(node)
    if (looksLikeIban(text)) return extractIban(text)
  }
  const tagged = firstDescendantText(el, [
    'account', 'acctid', 'bankaccno', 'accountiban', 'ibancont', 'contiban', 'accno'
  ])
  if (looksLikeIban(tagged)) return extractIban(tagged)
  const fromText = extractIban(textContent(el).slice(0, 400))
  return fromText
}

function ancestorStatement(el: XmlElement, parents: Map<XmlElement, XmlElement | null>) {
  let current: XmlElement | null | undefined = el
  while (current) {
    if (STATEMENT_TAGS.has(localName(current.name))) return current
    current = parents.get(current) || null
  }
  return null
}

function buildParentMap(root: XmlElement) {
  const parents = new Map<XmlElement, XmlElement | null>()
  const walk = (node: XmlElement, parent: XmlElement | null) => {
    parents.set(node, parent)
    node.children.forEach(childNode => walk(childNode, node))
  }
  walk(root, null)
  return parents
}

function directionFrom(el: XmlElement, amount: number): { direction: ParsedDirection; reversal: boolean } {
  const attrs = attrMap(el)
  const reversalRaw = [
    firstDescendantText(el, ['rvslind', 'reversalind', 'reversal']),
    attrs.rvslind, attrs.reversal, attrs.reversalind
  ].join(' ').toUpperCase()
  const reversal = /^(TRUE|YES|1|Y|DA)$/.test(reversalRaw.trim()) || /\bRVSL\b/.test(textContent(el).toUpperCase())

  const indicator = (
    firstDescendantText(el, ['cdtdbtind', 'trntype', 'trantype', 'dc', 'sens', 'type', 'creditdebit'])
    || attrs.cdtdbtind || attrs.credit || attrs.dc || attrs.type || ''
  ).toUpperCase()

  if (/\b(CRDT|CREDIT|CR|C|IN|PLUS)\b/.test(indicator) || indicator === 'YES') {
    return { direction: 'credit', reversal }
  }
  if (/\b(DBIT|DEBIT|DR|D|OUT|MINUS)\b/.test(indicator) || indicator === 'NO') {
    return { direction: 'debit', reversal }
  }

  const creditAmt = parseAmount(firstDescendantText(el, ['creditamount', 'sumacredit', 'incasare', 'incoming']))
  const debitAmt = parseAmount(firstDescendantText(el, ['debitamount', 'sumadebit', 'plata', 'outgoing']))
  if (creditAmt && creditAmt > 0) return { direction: 'credit', reversal }
  if (debitAmt && debitAmt > 0) return { direction: 'debit', reversal }
  if (amount < 0) return { direction: 'debit', reversal }
  return { direction: 'unknown', reversal }
}

function pickAmount(el: XmlElement) {
  const amtNode = findAll(el, 'amt').find(node => parseAmount(directText(node) || textContent(node)) !== null)
    || findAll(el, 'amount')[0]
    || findAll(el, 'suma')[0]
  const fromChildren = parseAmount(
    firstDescendantText(el, ['amt', 'amount', 'suma', 'value', 'creditamount', 'trnamount', 'sumatransactie'])
  )
  const signed = fromChildren ?? parseAmount(attr(el, 'amount')) ?? parseAmount(directText(el))
  const currency = (
    (amtNode && (attr(amtNode, 'ccy') || attr(amtNode, 'currency')))
    || firstDescendantText(el, ['ccy', 'currency', 'moneda'])
    || attr(el, 'ccy')
    || 'RON'
  ).toUpperCase()
  return {
    amount: signed === null ? null : Math.abs(signed),
    currency: currency.replace(/[^A-Z]/g, '').slice(0, 3) || 'RON'
  }
}

function counterpartFrom(el: XmlElement, direction: ParsedDirection) {
  const nameTags = direction === 'debit'
    ? ['cdtr', 'creditor', 'beneficiary', 'beneficiar']
    : ['dbtr', 'debtor', 'payer', 'platitor']
  let name = ''
  let iban = ''
  let cui = ''
  for (const tag of nameTags) {
    const node = findAll(el, tag)[0]
    if (!node) continue
    name = firstDescendantText(node, ['nm', 'name', 'nume', 'den']) || textContent(node)
    iban = firstIban(node)
    cui = extractCui(firstDescendantText(node, ['id', 'cui', 'orgid']) || textContent(node))
    if (name || iban) break
  }
  if (!name) {
    name = firstDescendantText(el, [
      'partnername', 'partname', 'numepartener', 'counterpartname', 'nume',
      'dbtrnm', 'payername', 'orderingparty', 'clientname'
    ])
  }
  if (!iban) {
    iban = extractIban(firstDescendantText(el, [
      'partneraccount', 'partiban', 'ibanpartener', 'counterpartiban',
      'dbtracct', 'payeriban', 'orderingaccount'
    ]))
    if (!iban) {
      const acct = findAll(el, 'dbtracct')[0] || findAll(el, 'cdtracct')[0]
      if (acct) iban = firstIban(acct)
    }
  }
  if (!cui) {
    cui = extractCui(firstDescendantText(el, ['id', 'cui', 'fiscalcode', 'codfiscal']) || name)
  }
  if (name && looksLikeIban(name) && name.trim().length <= 34) name = ''
  return {
    counterpartName: name || null,
    counterpartIban: normalizeIban(iban) || null,
    counterpartCui: cui || null
  }
}

function detailsFrom(el: XmlElement) {
  const parts = collectTexts(el, [
    'ustrd', 'addtlntryinf', 'addtltxinf', 'rmtinf', 'details', 'detalii',
    'descriere', 'explicatii', 'remark', 'paymentdetails', 'purpose',
    'narration', 'inf', 'ref'
  ])
  const unique = Array.from(new Set(parts.map(p => p.trim()).filter(Boolean)))
  return unique.join(' | ')
}

function refsFrom(el: XmlElement) {
  const bankTxnId = firstDescendantText(el, [
    'acctsvcrref', 'ntryref', 'txid', 'bankref', 'refbanca', 'stmtref', 'msgid'
  ]) || null
  const reference = firstDescendantText(el, [
    'endtoendid', 'instrid', 'chqnb', 'op', 'paymentref', 'reference', 'refop'
  ]) || null
  return {
    bankTxnId: bankTxnId || null,
    reference: reference && reference.toUpperCase() !== 'NOTPROVIDED' ? reference : null
  }
}

function skipReasonFor(txn: Omit<ParsedBankTxn, 'skipReason' | 'lineId'>): string | null {
  if (txn.reversal) {
    return 'Storno/reversare bancară — nu o importăm automat (risc de dublare).'
  }
  if (txn.direction === 'debit') {
    return 'Mișcare de debit (ieșire). Importăm doar încasări (credite).'
  }
  if (txn.amount <= 0) return 'Sumă invalidă sau zero.'
  if (txn.currency && txn.currency !== 'RON') {
    return `Monedă ${txn.currency} — importul recunoaște doar RON.`
  }
  return null
}

function toTxn(
  el: XmlElement,
  index: number,
  statement: { accountIban: string; statementDate: string | null; statementId: string | null }
): ParsedBankTxn {
  const { amount, currency } = pickAmount(el)
  const safeAmount = amount ?? 0
  const { direction, reversal } = directionFrom(el, amount ?? 0)
  const counterpart = counterpartFrom(el, direction)
  const dates = {
    bookingDate: parseDate(firstDescendantText(el, ['bookgdt', 'bookingdate', 'trndate', 'trandate', 'datatranzactie', 'date']))
      || statement.statementDate,
    valueDate: parseDate(firstDescendantText(el, ['valdt', 'valuedate', 'data'])) || null
  }
  const refs = refsFrom(el)
  const details = detailsFrom(el)
  const base = {
    direction: direction === 'unknown' && safeAmount > 0 ? 'credit' as const : direction,
    amount: safeAmount,
    currency,
    bookingDate: dates.bookingDate,
    valueDate: dates.valueDate,
    bankTxnId: refs.bankTxnId,
    reference: refs.reference,
    counterpartName: counterpart.counterpartName,
    counterpartIban: counterpart.counterpartIban,
    counterpartCui: counterpart.counterpartCui || extractCui(details) || null,
    details,
    statementIban: statement.accountIban,
    statementDate: statement.statementDate,
    statementId: statement.statementId,
    reversal
  }
  return {
    lineId: `t${index}`,
    ...base,
    skipReason: skipReasonFor(base)
  }
}

function statementMeta(el: XmlElement) {
  const accountIban = firstIban(child(el, 'acct') || el)
  const statementDate = parseDate(firstDescendantText(el, [
    'credttm', 'statementdate', 'statdate', 'fromtodt', 'date', 'dt'
  ]))
  const statementId = firstDescendantText(el, ['id', 'stmtid', 'statementno', 'elctrncseqnb']) || null
  const currency = (firstDescendantText(el, ['ccy', 'currency', 'moneda']) || 'RON').toUpperCase()
  return { accountIban, statementDate, statementId, currency }
}

function isEntry(el: XmlElement) {
  return ENTRY_TAGS.has(localName(el.name))
}

function collectEntries(root: XmlElement) {
  const parents = buildParentMap(root)
  const entries: XmlElement[] = []
  const seen = new Set<XmlElement>()
  const walk = (node: XmlElement) => {
    if (isEntry(node) && !seen.has(node)) {
      seen.add(node)
      entries.push(node)
      return
    }
    node.children.forEach(walk)
  }
  walk(root)
  return { entries, parents }
}

export function parseMulticash940(xml: string): MulticashParseResult {
  const trimmed = xml.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return { ok: false, error: 'Fișierul este gol.' }
  let root: XmlElement
  try {
    root = parseXml(trimmed)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'XML invalid.' }
  }

  const { entries, parents } = collectEntries(root)
  const warnings: string[] = []
  if (entries.length === 0) {
    return { ok: false, error: 'Nu am găsit tranzacții în XML (Ntry / Transaction). Verifică dacă este extras Multicash / camt.053.' }
  }

  const grouped = new Map<XmlElement | 'root', XmlElement[]>()
  for (const entry of entries) {
    const stmt = ancestorStatement(entry, parents)
    const key = stmt || 'root'
    const list = grouped.get(key) || []
    list.push(entry)
    grouped.set(key, list)
  }

  const statements: ParsedStatement[] = []
  let index = 0
  for (const [key, list] of grouped) {
    const meta = key === 'root' ? statementMeta(root) : statementMeta(key)
    if (!meta.accountIban) {
      warnings.push('Un extras nu are IBAN de cont. Poți importa încasările, dar verificarea IBAN-ului firmei lipsește.')
    }
    const transactions = list.map(entry => toTxn(entry, index++, {
      accountIban: meta.accountIban,
      statementDate: meta.statementDate,
      statementId: meta.statementId
    }))
    statements.push({
      accountIban: meta.accountIban,
      statementDate: meta.statementDate,
      statementId: meta.statementId,
      currency: meta.currency,
      transactions
    })
  }

  const all = statements.flatMap(s => s.transactions)
  if (grouped.size > 1) {
    warnings.push(`Fișierul conține ${grouped.size} extrae. Toate liniile sunt afișate împreună.`)
  }

  return {
    ok: true,
    statements,
    credits: all.filter(txn => !txn.skipReason && txn.direction === 'credit'),
    skipped: all.filter(txn => !!txn.skipReason),
    warnings
  }
}

export function paymentFingerprint(input: {
  statementIban: string
  paidOn: string
  amount: number
  counterpartIban: string
  bankTxnId: string
  details: string
}) {
  const key = [
    normalizeIban(input.statementIban),
    input.paidOn,
    Number(input.amount).toFixed(2),
    normalizeIban(input.counterpartIban),
    (input.bankTxnId || '').trim().toUpperCase(),
    (input.details || '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 160)
  ].join('|')
  return createHash('sha256').update(key).digest('hex')
}
