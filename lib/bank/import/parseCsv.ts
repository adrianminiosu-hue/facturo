import { paymentFingerprint } from '@/lib/bank/import/fingerprint'
import type { CsvColumnRole, CsvImportMapping, NormalizedStatementLine, ParseResult } from '@/lib/bank/import/types'

const CP1250: Record<number, string> = {
  0x8A: 'Š', 0x8C: 'Ś', 0x8D: 'Ť', 0x8E: 'Ž', 0x8F: 'Ź',
  0x9A: 'š', 0x9C: 'ś', 0x9D: 'ť', 0x9E: 'ž', 0x9F: 'ź',
  0xA1: 'ˇ', 0xA2: '˘', 0xA3: 'Ł', 0xA5: 'Ą', 0xA6: '¦',
  0xAA: 'Ş', 0xAC: 'Ź', 0xAF: 'Ż',
  0xB1: '±', 0xB2: '˛', 0xB3: 'ł', 0xB5: 'µ', 0xB9: 'ą',
  0xBA: 'ş', 0xBC: 'Ľ', 0xBD: '˝', 0xBE: 'ľ', 0xBF: 'ż',
  0xC0: 'Ŕ', 0xC1: 'Á', 0xC2: 'Â', 0xC3: 'Ă', 0xC4: 'Ä', 0xC5: 'Ĺ',
  0xC6: 'Ć', 0xC7: 'Ç', 0xC8: 'Č', 0xC9: 'É', 0xCA: 'Ę', 0xCB: 'Ë',
  0xCC: 'Ě', 0xCD: 'Í', 0xCE: 'Î', 0xCF: 'Ď',
  0xD0: 'Đ', 0xD1: 'Ń', 0xD2: 'Ň', 0xD3: 'Ó', 0xD4: 'Ô', 0xD5: 'Ő',
  0xD6: 'Ö', 0xD8: 'Ř', 0xD9: 'Ů', 0xDA: 'Ú', 0xDB: 'Ű', 0xDC: 'Ü',
  0xDD: 'Ý', 0xDE: 'Ţ', 0xDF: 'ß',
  0xE0: 'ŕ', 0xE1: 'á', 0xE2: 'â', 0xE3: 'ă', 0xE4: 'ä', 0xE5: 'ĺ',
  0xE6: 'ć', 0xE7: 'ç', 0xE8: 'č', 0xE9: 'é', 0xEA: 'ę', 0xEB: 'ë',
  0xEC: 'ě', 0xED: 'í', 0xEE: 'î', 0xEF: 'ď',
  0xF0: 'đ', 0xF1: 'ń', 0xF2: 'ň', 0xF3: 'ó', 0xF4: 'ô', 0xF5: 'ő',
  0xF6: 'ö', 0xF8: 'ř', 0xF9: 'ů', 0xFA: 'ú', 0xFB: 'ű', 0xFC: 'ü',
  0xFD: 'ý', 0xFE: 'ţ', 0xFF: '˙'
}

export function decodeCsvBytes(bytes: Uint8Array, encoding: CsvImportMapping['encoding']) {
  if (encoding === 'utf-8') {
    return new TextDecoder('utf-8').decode(bytes)
  }
  try {
    return new TextDecoder('windows-1250').decode(bytes)
  } catch {
    let out = ''
    for (const byte of bytes) {
      out += byte >= 0x80 ? (CP1250[byte] || String.fromCharCode(byte)) : String.fromCharCode(byte)
    }
    return out
  }
}

export function sniffCsvDelimiter(text: string): ';' | ',' {
  const first = text.split(/\r?\n/).find(line => line.trim()) || ''
  const semis = (first.match(/;/g) || []).length
  const commas = (first.match(/,/g) || []).length
  return semis >= commas ? ';' : ','
}

export function splitCsvLine(line: string, delimiter: ';' | ',') {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (ch === delimiter && !quoted) {
      out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  out.push(current.trim())
  return out
}

export function parseCsvAmount(value: string) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-')
  const cleaned = raw.replace(/[^\d,.\-]/g, '')
  let n: number
  if (cleaned.includes(',') && cleaned.includes('.')) {
    n = Number(cleaned.replace(/\./g, '').replace(',', '.'))
  } else if (cleaned.includes(',')) {
    n = Number(cleaned.replace(',', '.'))
  } else {
    n = Number(cleaned)
  }
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

export function parseCsvDate(value: string) {
  const raw = String(value || '').trim()
  const dotted = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dotted) {
    return `${dotted[3]}-${dotted[2].padStart(2, '0')}-${dotted[1].padStart(2, '0')}`
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return ''
}

export function previewCsv(text: string, delimiter?: ';' | ',') {
  const delim = delimiter || sniffCsvDelimiter(text)
  const rows = text.split(/\r?\n/).filter(line => line.trim()).slice(0, 6).map(line => splitCsvLine(line, delim))
  return { delimiter: delim, headers: rows[0] || [], rows: rows.slice(1, 6) }
}

function cell(row: string[], columns: CsvColumnRole[], role: CsvColumnRole) {
  const index = columns.indexOf(role)
  return index >= 0 ? (row[index] || '') : ''
}

export function parseCsv(text: string, mapping: CsvImportMapping): ParseResult {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  const body = mapping.header ? lines.slice(1) : lines
  const out: NormalizedStatementLine[] = []

  body.forEach((raw, index) => {
    const row = splitCsvLine(raw, mapping.delimiter)
    const date = parseCsvDate(cell(row, mapping.columns, 'date'))
    const debit = parseCsvAmount(cell(row, mapping.columns, 'debit'))
    const credit = parseCsvAmount(cell(row, mapping.columns, 'credit'))
    const signedCol = parseCsvAmount(cell(row, mapping.columns, 'amount'))
    let amount = 0
    if (mapping.columns.includes('debit') || mapping.columns.includes('credit')) {
      amount = (credit || 0) - Math.abs(debit || 0)
    } else {
      amount = signedCol || 0
    }
    const name = cell(row, mapping.columns, 'name')
    const iban = cell(row, mapping.columns, 'iban').replace(/\s/g, '').toUpperCase()
    const details = cell(row, mapping.columns, 'details')
    const reference = cell(row, mapping.columns, 'reference')
    const error = !date
      ? `Linia ${index + 1}: dată invalidă`
      : amount === 0
        ? `Linia ${index + 1}: sumă lipsă`
        : null
    out.push({
      statementIban: '',
      currency: 'RON',
      bookingDate: date,
      valueDate: date || null,
      amount,
      counterpartyName: name,
      counterpartyIban: iban,
      description: details,
      providerRef: reference,
      fingerprint: paymentFingerprint({
        statementIban: '',
        paidOn: date,
        amount: Math.abs(amount),
        counterpartIban: iban,
        bankTxnId: reference,
        details
      }),
      lineError: error
    })
  })

  const preview = previewCsv(text, mapping.delimiter)
  return {
    ok: true,
    format: 'csv',
    lines: out,
    warnings: out.every(line => line.lineError) && out.length ? ['Nicio linie CSV validă.'] : [],
    statementIbans: [],
    csvPreview: preview
  }
}
