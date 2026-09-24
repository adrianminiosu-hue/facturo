import type { StatementFormat } from '@/lib/bank/import/types'

export function detectFormat(fileName: string, content: string): StatementFormat {
  const name = String(fileName || '').toLowerCase()
  const head = String(content || '').slice(0, 4000)
  const upper = head.toUpperCase()

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    if (upper.includes('<BKTOCSTMRSTMT') || upper.includes('CAMT.053')) return 'camt053'
    if (upper.includes('<NTRY') || upper.includes('<STMT')) return 'xml940'
    return 'csv'
  }

  if (upper.includes('CAMT.053') || upper.includes('<BKTOCSTMRSTMT') || upper.includes(':BKTOCSTMRSTMT')) {
    return 'camt053'
  }

  if (name.endsWith('.xml') || upper.includes('<?XML') || /<[A-Z]/.test(upper)) {
    return 'xml940'
  }

  return 'csv'
}
