import { detectFormat } from '@/lib/bank/import/detectFormat'
import { paymentFingerprint } from '@/lib/bank/import/fingerprint'
import { parseCamt053 } from '@/lib/bank/import/parseCamt053'
import { decodeCsvBytes, parseCsv, previewCsv } from '@/lib/bank/import/parseCsv'
import { parseXml940 } from '@/lib/bank/import/parseXml940'
import type { CsvImportMapping, ImportSummary, ParseResult, StatementFormat } from '@/lib/bank/import/types'
import { applyMatchWithContext, loadMatchContext, logBankMatchEvent } from '@/lib/bank/matching/apply'
import { tenantWriteVerified, type QueryClient } from '@/lib/bank/tenantWriteServer'
import { ibansEqual, normalizeIban } from '@/lib/iban'
import { getCompanyForActor } from '@/lib/portfolio'

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_LINES = 10_000

export function parseStatementFile(input: {
  fileName: string
  text: string
  csvMapping?: CsvImportMapping | null
}): ParseResult {
  const format = detectFormat(input.fileName, input.text)
  if (format === 'camt053') return parseCamt053(input.text)
  if (format === 'xml940') return parseXml940(input.text)
  if (!input.csvMapping) {
    const preview = previewCsv(input.text)
    return {
      ok: true,
      format: 'csv',
      lines: [],
      warnings: [],
      statementIbans: [],
      csvPreview: preview
    }
  }
  return parseCsv(input.text, input.csvMapping)
}

async function companyIbans(client: QueryClient, companyId: string, companyIban?: string | null) {
  const ibans = new Set<string>()
  if (companyIban) ibans.add(normalizeIban(companyIban))
  const { data } = await client.from('bank_accounts').select('id, iban, currency, import_mapping').eq('company_id', companyId)
  const accounts = (data || []) as Array<{ id: string; iban: string; currency?: string | null; import_mapping?: CsvImportMapping | null }>
  for (const account of accounts) ibans.add(normalizeIban(account.iban))
  return { ibans, accounts }
}

async function findForeignCompanyIban(client: QueryClient, iban: string, companyId: string) {
  const { data } = await client
    .from('bank_accounts')
    .select('company_id, iban')
    .neq('company_id', companyId)
  return ((data || []) as Array<{ company_id: string; iban: string }>).some(row => ibansEqual(row.iban, iban))
}

export type ImportOutcome =
  | ImportSummary
  | { needsCsvMapping: true; format: 'csv'; preview?: { headers: string[]; rows: string[][]; delimiter: ';' | ',' } }
  | { needsIbanConfirm: true; foreignIban: string; format: StatementFormat }

export async function importStatement(
  client: QueryClient,
  opts: {
    actorUserId: string
    userId: string
    companyId: string
    fileName: string
    bytes: Uint8Array
    csvMapping?: CsvImportMapping | null
    confirmForeignIban?: boolean
    statementIbanOverride?: string | null
  }
): Promise<ImportOutcome> {
  if (opts.bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new Error('Fișierul depășește 10 MB.')
  }
  const company = await getCompanyForActor(client, opts.companyId, opts.actorUserId)
  if (!company) throw new Error('Firma nu a fost găsită.')
  const ownerUserId = String(company.user_id)
  await tenantWriteVerified(client, { userId: ownerUserId, companyId: opts.companyId, createdBy: opts.actorUserId })

  const format = detectFormat(opts.fileName, new TextDecoder('utf-8').decode(opts.bytes.slice(0, 4000)))
  const text = format === 'csv' && opts.csvMapping?.encoding === 'windows-1250'
    ? decodeCsvBytes(opts.bytes, 'windows-1250')
    : new TextDecoder('utf-8').decode(opts.bytes)

  const parsed = parseStatementFile({
    fileName: opts.fileName,
    text,
    csvMapping: opts.csvMapping
  })
  if (!parsed.ok) throw new Error(parsed.error)
  if (parsed.format === 'csv' && !opts.csvMapping) {
    return { needsCsvMapping: true, preview: parsed.csvPreview, format: 'csv' }
  }
  if (parsed.lines.length > MAX_IMPORT_LINES) {
    throw new Error('Fișierul are peste 10.000 de linii.')
  }

  const statementIban = normalizeIban(opts.statementIbanOverride || parsed.statementIbans[0] || '')
  const { ibans, accounts } = await companyIbans(client, opts.companyId, company.iban)
  if (statementIban && !ibans.has(statementIban)) {
    const foreign = await findForeignCompanyIban(client, statementIban, opts.companyId)
    if (foreign && !opts.confirmForeignIban) {
      return { needsIbanConfirm: true, foreignIban: statementIban, format: parsed.format }
    }
    if (!foreign && !opts.confirmForeignIban && company.iban && !ibansEqual(company.iban, statementIban) && accounts.length === 0) {
      return { needsIbanConfirm: true, foreignIban: statementIban, format: parsed.format }
    }
  }

  let account = accounts.find(row => ibansEqual(row.iban, statementIban))
  if (!account && statementIban) {
    const tenant = await tenantWriteVerified(client, {
      userId: ownerUserId,
      companyId: opts.companyId,
      createdBy: opts.actorUserId
    })
    const inserted = await client.from('bank_accounts').insert({
      ...tenant,
      connection_id: null,
      iban: statementIban,
      currency: parsed.lines[0]?.currency || 'RON',
      account_name: statementIban,
      import_mapping: opts.csvMapping || null
    }).select('id, iban, currency, import_mapping')
    if (inserted.error) throw new Error(inserted.error.message)
    account = ((inserted.data || []) as Array<{ id: string; iban: string; currency?: string | null; import_mapping?: CsvImportMapping | null }>)[0]
  } else if (account && opts.csvMapping) {
    await client.from('bank_accounts').update({ import_mapping: opts.csvMapping }).eq('id', account.id)
  }

  const companyAccountIbans = new Set([...ibans, statementIban].filter(Boolean))
  const context = await loadMatchContext(client, opts.companyId, ownerUserId)
  const tenant = await tenantWriteVerified(client, {
    userId: ownerUserId,
    companyId: opts.companyId,
    createdBy: opts.actorUserId
  })

  let newCount = 0
  let autoMatched = 0
  let toConfirm = 0
  let duplicates = 0
  let internalTransfers = 0
  let lineErrors = 0
  const transactionIds: string[] = []

  for (const line of parsed.lines) {
    if (line.lineError) {
      lineErrors += 1
      continue
    }
    if (parsed.format === 'csv' && statementIban) {
      line.statementIban = statementIban
      line.fingerprint = paymentFingerprint({
        statementIban,
        paidOn: line.bookingDate,
        amount: Math.abs(line.amount),
        counterpartIban: line.counterpartyIban,
        bankTxnId: line.providerRef || '',
        details: line.description
      })
    }

    const existing = await client
      .from('bank_transactions')
      .select('*')
      .eq('company_id', opts.companyId)
      .eq('fingerprint', line.fingerprint)
      .maybeSingle()
    if (existing.data) {
      duplicates += 1
      const row = existing.data as { id?: string; match_status?: string | null }
      if (row.id && (row.match_status === 'unmatched' || row.match_status === 'suggested')) {
        try {
          const result = await applyMatchWithContext(client, {
            transactionId: String(row.id),
            actorUserId: opts.actorUserId,
            transaction: existing.data as never,
            context,
            autoApply: false
          })
          if (result.applied) autoMatched += 1
          else if (result.status === 'suggested') toConfirm += 1
        } catch {
          lineErrors += 1
        }
      }
      continue
    }

    const counterparty = normalizeIban(line.counterpartyIban)
    const isInternal = !!counterparty && companyAccountIbans.has(counterparty) && !ibansEqual(counterparty, statementIban)
    const insert = await client.from('bank_transactions').insert({
      ...tenant,
      bank_account_id: account?.id || null,
      source: parsed.format === 'xml940' ? 'xml940' : parsed.format === 'camt053' ? 'camt053' : 'csv',
      provider_tx_id: line.providerRef || null,
      fingerprint: line.fingerprint,
      booking_date: line.bookingDate,
      value_date: line.valueDate,
      amount: line.amount,
      currency: line.currency || 'RON',
      counterparty_name: line.counterpartyName || null,
      counterparty_iban: line.counterpartyIban || null,
      description: line.description || null,
      match_status: isInternal ? 'ignored' : 'unmatched',
      ignored_reason: isInternal ? 'transfer_intern' : null
    }).select('*')
    if (insert.error) {
      if (insert.error.message?.toLowerCase().includes('fingerprint') || String((insert.error as { code?: string }).code) === '23505') {
        duplicates += 1
        continue
      }
      throw new Error(insert.error.message)
    }
    const row = ((insert.data || []) as Array<Record<string, unknown>>)[0]
    if (!row) continue
    newCount += 1
    transactionIds.push(String(row.id))
    if (isInternal) {
      internalTransfers += 1
      continue
    }
    try {
      const result = await applyMatchWithContext(client, {
        transactionId: String(row.id),
        actorUserId: opts.actorUserId,
        transaction: row as never,
        context,
        autoApply: false
      })
      if (result.applied) autoMatched += 1
      else toConfirm += 1
    } catch {
      lineErrors += 1
    }
  }

  await logBankMatchEvent(client, {
    userId: ownerUserId,
    companyId: opts.companyId,
    actorUserId: opts.actorUserId,
    action: 'import',
    payload: {
      fileName: opts.fileName,
      format: parsed.format,
      newCount,
      autoMatched,
      toConfirm,
      duplicates,
      internalTransfers,
      lineErrors
    }
  })

  return {
    format: parsed.format,
    newCount,
    autoMatched,
    toConfirm,
    duplicates,
    internalTransfers,
    lineErrors,
    accountIban: statementIban,
    transactionIds
  }
}
