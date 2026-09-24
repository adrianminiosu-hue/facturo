export type StatementFormat = 'xml940' | 'camt053' | 'csv'

export type CsvColumnRole =
  | 'ignore'
  | 'date'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'name'
  | 'iban'
  | 'details'
  | 'reference'

export type CsvImportMapping = {
  delimiter: ';' | ','
  encoding: 'utf-8' | 'windows-1250'
  header: boolean
  columns: CsvColumnRole[]
}

export type NormalizedStatementLine = {
  statementIban: string
  currency: string
  bookingDate: string
  valueDate: string | null
  amount: number
  counterpartyName: string
  counterpartyIban: string
  description: string
  providerRef?: string | null
  fingerprint: string
  lineError?: string | null
}

export type ParseWarning = string

export type ParseOk = {
  ok: true
  format: StatementFormat
  lines: NormalizedStatementLine[]
  warnings: ParseWarning[]
  statementIbans: string[]
  csvPreview?: { headers: string[]; rows: string[][]; delimiter: ';' | ',' }
}

export type ParseErr = {
  ok: false
  error: string
  format?: StatementFormat | null
}

export type ParseResult = ParseOk | ParseErr

export type ImportSummary = {
  format: StatementFormat
  newCount: number
  autoMatched: number
  toConfirm: number
  duplicates: number
  internalTransfers: number
  lineErrors: number
  needsIbanConfirm?: boolean
  foreignIban?: string
  accountIban?: string
  transactionIds: string[]
}
