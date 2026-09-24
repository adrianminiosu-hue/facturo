import { paymentFingerprint } from '@/lib/bank/import/fingerprint'
import type { ParseResult } from '@/lib/bank/import/types'
import { parseMulticash940 } from '@/lib/multicash940'

export function parseXml940(xml: string): ParseResult {
  const parsed = parseMulticash940(xml)
  if (!parsed.ok) return { ok: false, error: parsed.error, format: 'xml940' }

  const lines = parsed.statements.flatMap(statement =>
    statement.transactions.map(txn => {
      const bookingDate = txn.bookingDate || txn.valueDate || txn.statementDate || ''
      const signed = txn.direction === 'debit' ? -Math.abs(txn.amount) : Math.abs(txn.amount)
      return {
        statementIban: txn.statementIban || statement.accountIban || '',
        currency: txn.currency || statement.currency || 'RON',
        bookingDate,
        valueDate: txn.valueDate,
        amount: signed,
        counterpartyName: txn.counterpartName || '',
        counterpartyIban: txn.counterpartIban || '',
        description: txn.details || '',
        providerRef: txn.bankTxnId,
        fingerprint: paymentFingerprint({
          statementIban: txn.statementIban || statement.accountIban || '',
          paidOn: bookingDate,
          amount: txn.amount,
          counterpartIban: txn.counterpartIban || '',
          bankTxnId: txn.bankTxnId || '',
          details: txn.details
        }),
        lineError: txn.skipReason || (!bookingDate ? 'Lipsește data' : null)
      }
    })
  )

  return {
    ok: true,
    format: 'xml940',
    lines,
    warnings: parsed.warnings,
    statementIbans: [...new Set(parsed.statements.map(s => s.accountIban).filter(Boolean))]
  }
}
