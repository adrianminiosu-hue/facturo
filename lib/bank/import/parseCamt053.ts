import { paymentFingerprint } from '@/lib/bank/import/fingerprint'
import type { NormalizedStatementLine, ParseResult } from '@/lib/bank/import/types'
import { createHash } from 'crypto'
import {
  attr,
  child,
  findAll,
  firstDescendantText,
  parseXml,
  textContent,
  type XmlElement
} from '@/lib/xmlLite'

function dateOf(node?: XmlElement | null) {
  if (!node) return ''
  return firstDescendantText(node, ['dt', 'dttm']).slice(0, 10)
}

function ibanOf(node?: XmlElement | null) {
  if (!node) return ''
  return firstDescendantText(node, ['iban']).replace(/\s/g, '').toUpperCase()
}

function nameOf(party?: XmlElement | null) {
  if (!party) return ''
  return firstDescendantText(party, ['nm'])
}

function refsOf(tx: XmlElement) {
  return firstDescendantText(tx, ['acctsvcrref', 'txid', 'endtoendid', 'instrid', 'chqid']) || ''
}

function remittanceOf(tx: XmlElement) {
  const bits = [
    ...findAll(tx, 'ustrd').map(textContent),
    ...findAll(tx, 'strd').flatMap(node => findAll(node, 'ref').map(textContent))
  ].filter(Boolean)
  return bits.join(' · ')
}

function lineFingerprint(line: {
  statementIban: string
  bookingDate: string
  amount: number
  counterpartyIban: string
  description: string
  providerRef: string
}) {
  if (line.providerRef) {
    return createHash('sha256').update(`camt|${line.statementIban}|${line.providerRef}`).digest('hex')
  }
  return paymentFingerprint({
    statementIban: line.statementIban,
    paidOn: line.bookingDate,
    amount: Math.abs(line.amount),
    counterpartIban: line.counterpartyIban,
    bankTxnId: '',
    details: line.description
  })
}

function ntrySign(ntry: XmlElement) {
  const ind = firstDescendantText(ntry, ['cdtdbtind']).toUpperCase()
  return ind.startsWith('DBIT') ? -1 : 1
}

export function parseCamt053(xml: string): ParseResult {
  const trimmed = String(xml || '').replace(/^\uFEFF/, '').trim()
  if (!trimmed) return { ok: false, error: 'Fișierul este gol.', format: 'camt053' }
  let root: XmlElement
  try {
    root = parseXml(trimmed)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'XML invalid.', format: 'camt053' }
  }

  const stmts = findAll(root, 'stmt')
  if (stmts.length === 0) {
    return { ok: false, error: 'Nu am găsit Stmt în CAMT.053.', format: 'camt053' }
  }

  const lines: NormalizedStatementLine[] = []
  const statementIbans: string[] = []

  for (const stmt of stmts) {
    const acct = child(stmt, 'acct')
    const statementIban = ibanOf(acct)
    const stmtCcy = firstDescendantText(acct || stmt, ['ccy']) || 'RON'
    if (statementIban) statementIbans.push(statementIban)

    const entries = stmt.children.filter(node => node.name.toLowerCase() === 'ntry' || node.name.toLowerCase().endsWith(':ntry'))
    const ntries = entries.length ? entries : findAll(stmt, 'ntry')

    for (const ntry of ntries) {
      const sign = ntrySign(ntry)
      const bookingDate = dateOf(findAll(ntry, 'bookgdt')[0])
      const valueDate = dateOf(findAll(ntry, 'valdt')[0]) || null
      const ntryAmt = Number(firstDescendantText(ntry, ['amt']))
      const ntryCcy = attr(findAll(ntry, 'amt')[0] || ntry, 'ccy') || stmtCcy
      const ntryRef = firstDescendantText(ntry, ['acctsvcrref']) || firstDescendantText(ntry, ['ntryref'])
      const txDetails = findAll(ntry, 'txdtls')
      const units = txDetails.length ? txDetails : [ntry]

      for (const tx of units) {
        const related = findAll(tx, 'rltdpties')[0] || tx
        const party = sign > 0
          ? (child(related, 'dbtr') || findAll(tx, 'dbtr')[0])
          : (child(related, 'cdtr') || findAll(tx, 'cdtr')[0])
        const partyAcct = sign > 0
          ? (child(related, 'dbtracct') || findAll(tx, 'dbtracct')[0])
          : (child(related, 'cdtracct') || findAll(tx, 'cdtracct')[0])
        const amtNode = findAll(tx, 'amt')[0] || findAll(ntry, 'amt')[0]
        const rawAmt = Number(textContent(amtNode || ntry) || ntryAmt)
        const amount = (Number.isFinite(rawAmt) ? rawAmt : 0) * sign
        const providerRef = refsOf(tx) || ntryRef
        const description = remittanceOf(tx) || remittanceOf(ntry)
        const counterpartyIban = ibanOf(partyAcct)
        lines.push({
          statementIban,
          currency: attr(amtNode || ntry, 'ccy') || ntryCcy || 'RON',
          bookingDate,
          valueDate,
          amount,
          counterpartyName: nameOf(party),
          counterpartyIban,
          description,
          providerRef,
          fingerprint: lineFingerprint({
            statementIban,
            bookingDate,
            amount,
            counterpartyIban,
            description,
            providerRef
          }),
          lineError: !bookingDate || !Number.isFinite(amount) || amount === 0 ? 'Linie CAMT incompletă' : null
        })
      }
    }
  }

  if (lines.length === 0) {
    return { ok: false, error: 'Nu am găsit Ntry / TxDtls în CAMT.053.', format: 'camt053' }
  }

  return {
    ok: true,
    format: 'camt053',
    lines,
    warnings: [],
    statementIbans: [...new Set(statementIbans)]
  }
}
