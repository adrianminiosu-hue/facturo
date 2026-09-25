import { calendarDateInBucharest } from '@/lib/dates'
import { AUTO_APPLY_THRESHOLD, RULE } from '@/lib/bank/matching/constants'
import { extractInvoiceRefs } from '@/lib/bank/matching/extractRefs'
import { matchBankTransaction } from '@/lib/bank/matching/engine'
import { tenantWriteVerified, type QueryClient } from '@/lib/bank/tenantWriteServer'
import { normalizeIban } from '@/lib/iban'
import { remainingOf } from '@/lib/invoiceMath'
import { ensureConvertedInvoiceAmounts } from '@/lib/invoicePersist'
import { isCreditNote, isDraftInvoice, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { actorCanAccessOwner } from '@/lib/portfolio'
import { fromBani, toBani, type InvoiceDirection, type LearnedRule, type MatchAllocation, type MatchCandidate, type MatchInvoice } from '@/lib/bank/matching/types'
import { invoiceKey, normalizePartyName, sameIban } from '@/lib/bank/matching/normalize'

type ApplyOpts = {
  transactionId: string
  actorUserId: string
  autoApply?: boolean
}

type LinkableInvoice = {
  id: string
  series: string
  invoice_number: string
  direction: InvoiceDirection
  unlinked: Array<{ id: string; amount_bani: number }>
}

type BankTransactionRow = {
  id: string
  user_id: string
  company_id: string
  booking_date: string
  amount: number | string
  currency?: string | null
  counterparty_name?: string | null
  counterparty_iban?: string | null
  description?: string | null
  source?: string | null
  match_status?: string | null
}

type InvoiceClientRel = {
  company_name?: string | null
  cui?: string | null
  iban?: string | null
}

type InvoiceLoadRow = {
  id: string
  series?: string | null
  invoice_number?: string | null
  client_id?: string | null
  issue_date?: string | null
  due_date?: string | null
  total?: number | null
  amount_paid?: number | null
  prepaid_amount?: number | null
  status?: string | null
  currency?: string | null
  invoice_type_code?: string | null
  direction?: string | null
  notes?: string | null
  exchange_rate?: number | null
  subtotal?: number | null
  invoice_items?: Array<{ quantity?: number | null; unit_price?: number | null; tva_rate?: number | null; total?: number | null }> | null
  clients?: InvoiceClientRel | InvoiceClientRel[] | null
}

function asClient(value: InvoiceLoadRow['clients']): InvoiceClientRel {
  if (Array.isArray(value)) return value[0] || {}
  return value || {}
}

function directionOf(row: { direction?: string | null; notes?: string | null }): InvoiceDirection {
  return isPurchaseInvoice(row) ? 'purchase' : 'issued'
}

function isOpenForMatch(row: {
  status?: string | null
  invoice_type_code?: string | null
}, remainingBani: number) {
  if (isDraftInvoice(row.status)) return false
  if (isCreditNote(row.invoice_type_code)) return false
  return remainingBani > 1
}

function isRemainingOverflow(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return /allocation exceeds invoice remaining/i.test(message)
}

function blockedInvoiceIds(context: MatchContext, allocations: MatchAllocation[]) {
  const blocked = new Set<string>()
  for (const allocation of allocations) {
    const invoice = context.open.find(row => row.id === allocation.invoiceId)
    if (!invoice || invoice.remaining_bani < allocation.amount_bani) blocked.add(allocation.invoiceId)
  }
  return blocked
}

function contextWithout(context: MatchContext, invoiceIds: Set<string>): MatchContext {
  if (invoiceIds.size === 0) return context
  return {
    ...context,
    open: context.open.filter(invoice => !invoiceIds.has(invoice.id) && invoice.remaining_bani > 0)
  }
}

function pickLinkPayments(unlinked: Array<{ id: string; amount_bani: number }>, needBani: number) {
  const exact = unlinked.find(payment => payment.amount_bani === needBani)
  if (exact) return [exact]
  const picked: Array<{ id: string; amount_bani: number }> = []
  let sum = 0
  for (const payment of [...unlinked].sort((a, b) => a.amount_bani - b.amount_bani)) {
    if (sum >= needBani) break
    picked.push(payment)
    sum += payment.amount_bani
  }
  return sum + 1 >= needBani ? picked : null
}

function linkCandidate(transaction: BankTransactionRow, context: MatchContext): MatchCandidate | null {
  const absAmount = Math.abs(toBani(Number(transaction.amount)))
  if (!absAmount) return null
  const direction: MatchInvoice['direction'] = Number(transaction.amount) < 0 ? 'purchase' : 'issued'
  const refs = extractInvoiceRefs(
    `${transaction.description || ''} ${transaction.counterparty_name || ''}`,
    context.seriesList.length ? context.seriesList : [context.defaultSeries],
    context.defaultSeries
  )
  const hits = context.linkable.filter(invoice => {
    if (invoice.direction !== direction) return false
    return refs.some(ref => invoiceKey(ref.series, ref.number) === invoiceKey(invoice.series, invoice.invoice_number))
  })
  if (hits.length !== 1) return null
  const picked = pickLinkPayments(hits[0].unlinked, absAmount)
  if (!picked) return null
  return {
    allocations: [{ invoiceId: hits[0].id, amount_bani: absAmount }],
    confidence: 95,
    rule: RULE.alreadyCollected,
    overpayment_bani: 0,
    auto: true
  }
}

async function linkExistingAllocations(
  client: QueryClient,
  opts: { transaction: BankTransactionRow; invoiceIds: string[] }
) {
  const ids = [...new Set(opts.invoiceIds.filter(Boolean))]
  if (!ids.length) return false
  const { data, error } = await client
    .from('invoice_payments')
    .select('id, invoice_id, amount, bank_transaction_id')
    .in('invoice_id', ids)
  if (error) throw new Error(error.message)
  const unlinked = ((data || []) as Array<{ id?: string; invoice_id?: string; amount?: number | string; bank_transaction_id?: string | null }>)
    .filter(row => row.id && row.invoice_id && !row.bank_transaction_id)
    .map(row => ({ id: String(row.id), invoice_id: String(row.invoice_id), amount_bani: toBani(Number(row.amount || 0)) }))
  const need = Math.abs(toBani(Number(opts.transaction.amount)))
  const byInvoice = new Map<string, typeof unlinked>()
  for (const row of unlinked) {
    const list = byInvoice.get(row.invoice_id) || []
    list.push(row)
    byInvoice.set(row.invoice_id, list)
  }
  const chosen: string[] = []
  for (const invoiceId of ids) {
    const picked = pickLinkPayments(byInvoice.get(invoiceId) || [], need)
    if (picked) {
      chosen.push(...picked.map(row => row.id))
      break
    }
  }
  if (ids.length > 1 && !chosen.length) {
    const combined = pickLinkPayments(unlinked, need)
    if (combined) chosen.push(...combined.map(row => row.id))
  }
  if (!chosen.length) return false
  for (const paymentId of chosen) {
    const update = await client.from('invoice_payments').update({
      bank_transaction_id: opts.transaction.id,
      match_confidence: 95,
      match_rule: RULE.alreadyCollected
    }).eq('id', paymentId)
    if (update.error) throw new Error(update.error.message)
  }
  return true
}

async function assertCanAccess(client: QueryClient, actorUserId: string, ownerUserId: string) {
  const allowed = await actorCanAccessOwner(client, actorUserId, ownerUserId)
  if (!allowed) throw new Error('not allowed')
}

async function loadTransaction(client: QueryClient, transactionId: string) {
  const { data, error } = await client.from('bank_transactions').select('*').eq('id', transactionId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('transaction not found')
  return data as BankTransactionRow
}

async function loadInvoices(client: QueryClient, companyId: string, ownerUserId: string) {
  const { data: invoices, error } = await client
    .from('invoices')
    .select('id, series, invoice_number, client_id, issue_date, due_date, total, amount_paid, prepaid_amount, status, currency, invoice_type_code, direction, notes, exchange_rate, subtotal, invoice_items(quantity, unit_price, tva_rate, total), clients(company_name, cui, iban)')
    .eq('company_id', companyId)
    .eq('user_id', ownerUserId)
  if (error) throw new Error(error.message)
  const rows = await Promise.all(((invoices || []) as InvoiceLoadRow[]).map(row => ensureConvertedInvoiceAmounts(client, row)))
  const clientIds = [...new Set(rows.map(row => row.client_id).filter((id): id is string => !!id))]
  const ibansByClient = new Map<string, string[]>()
  if (clientIds.length) {
    const { data: banks } = await client
      .from('client_bank_accounts')
      .select('client_id, iban')
      .in('client_id', clientIds)
    for (const bank of (banks || []) as Array<{ client_id?: string; iban?: string | null }>) {
      if (!bank.client_id) continue
      const list = ibansByClient.get(bank.client_id) || []
      if (bank.iban) list.push(String(bank.iban))
      ibansByClient.set(bank.client_id, list)
    }
  }
  const paymentsByInvoice = new Map<string, Array<{ id: string; amount: number; bank_transaction_id?: string | null }>>()
  if (rows.length) {
    const { data: payments } = await client
      .from('invoice_payments')
      .select('id, invoice_id, amount, bank_transaction_id')
      .in('invoice_id', rows.map(row => row.id))
    for (const payment of (payments || []) as Array<{ id?: string; invoice_id?: string; amount?: number | string | null; bank_transaction_id?: string | null }>) {
      if (!payment.invoice_id) continue
      const list = paymentsByInvoice.get(payment.invoice_id) || []
      list.push({
        id: String(payment.id || ''),
        amount: Number(payment.amount || 0),
        bank_transaction_id: payment.bank_transaction_id || null
      })
      paymentsByInvoice.set(payment.invoice_id, list)
    }
  }
  const open: MatchInvoice[] = []
  const linkable: LinkableInvoice[] = []
  const series = new Set<string>()
  for (const row of rows) {
    series.add(String(row.series || ''))
    const pays = paymentsByInvoice.get(row.id) || []
    const paid = Math.max(pays.reduce((sum, payment) => sum + payment.amount, 0), Number(row.amount_paid || 0))
    const remainingBani = toBani(remainingOf({
      ...row,
      amount_paid: paid
    }))
    const unlinked = pays
      .filter(payment => payment.id && !payment.bank_transaction_id)
      .map(payment => ({ id: payment.id, amount_bani: toBani(payment.amount) }))
    if (unlinked.length && remainingBani <= 1 && !isDraftInvoice(row.status) && !isCreditNote(row.invoice_type_code)) {
      linkable.push({
        id: row.id,
        series: String(row.series || ''),
        invoice_number: String(row.invoice_number || ''),
        direction: directionOf(row),
        unlinked
      })
    }
    if (!isOpenForMatch(row, remainingBani)) continue
    const related = asClient(row.clients)
    const extra = row.client_id ? ibansByClient.get(row.client_id) || [] : []
    open.push({
      id: row.id,
      series: String(row.series || ''),
      invoice_number: String(row.invoice_number || ''),
      client_id: row.client_id || null,
      client_name: String(related.company_name || ''),
      client_cui: String(related.cui || ''),
      client_ibans: [...new Set([related.iban, ...extra].filter((value): value is string => !!value).map(value => String(value)))],
      issue_date: row.issue_date || null,
      due_date: row.due_date || null,
      remaining_bani: remainingBani,
      currency: String(row.currency || 'RON'),
      direction: directionOf(row)
    })
  }
  return { open, linkable, seriesList: [...series].filter(Boolean) }
}

async function loadRules(client: QueryClient, companyId: string, ownerUserId: string): Promise<LearnedRule[]> {
  const { data } = await client
    .from('bank_match_rules')
    .select('client_id, counterparty_iban, counterparty_name_norm')
    .eq('company_id', companyId)
    .eq('user_id', ownerUserId)
  return (data || []) as LearnedRule[]
}

function sourceFromTx(source?: string | null) {
  if (source === 'xml940' || source === 'camt053' || source === 'csv' || source === 'api') {
    return source === 'api' ? 'bank_api' : source
  }
  return 'manual'
}

async function writeAllocations(
  client: QueryClient,
  opts: {
    transaction: BankTransactionRow
    allocations: MatchAllocation[]
    confidence: number
    rule: string
    actorUserId: string
  }
) {
  // A receipt cannot be booked on a day that has not happened yet (bad statement line or test data).
  if (opts.transaction.booking_date > calendarDateInBucharest(0)) {
    throw new Error(`Tranzacția are data ${opts.transaction.booking_date}, în viitor. Verifică extrasul.`)
  }
  const tenant = await tenantWriteVerified(client, {
    userId: opts.transaction.user_id,
    companyId: opts.transaction.company_id,
    createdBy: opts.actorUserId
  })
  const rows = opts.allocations.map(allocation => ({
    ...tenant,
    invoice_id: allocation.invoiceId,
    bank_transaction_id: opts.transaction.id,
    amount: fromBani(allocation.amount_bani),
    paid_on: opts.transaction.booking_date,
    method: 'transfer',
    source: sourceFromTx(opts.transaction.source),
    match_confidence: opts.confidence,
    match_rule: opts.rule,
    counterpart_name: opts.transaction.counterparty_name || null,
    counterpart_iban: opts.transaction.counterparty_iban || null
  }))
  const insert = await client.from('invoice_payments').insert(rows).select('id')
  if (insert.error) throw new Error(insert.error.message)
  return ((insert.data || []) as Array<{ id?: string }>).map(row => row.id).filter((id): id is string => !!id)
}

export type MatchContext = {
  open: MatchInvoice[]
  linkable: LinkableInvoice[]
  seriesList: string[]
  defaultSeries: string
  rules: LearnedRule[]
}

export async function logBankMatchEvent(
  client: QueryClient,
  opts: {
    userId: string
    companyId: string
    actorUserId: string
    transactionId?: string | null
    action: 'import' | 'auto_apply' | 'confirm' | 'ignore' | 'undo' | 'reallocate'
    payload?: Record<string, unknown>
  }
) {
  const tenant = await tenantWriteVerified(client, {
    userId: opts.userId,
    companyId: opts.companyId,
    createdBy: opts.actorUserId
  })
  await client.from('bank_match_events').insert({
    ...tenant,
    bank_transaction_id: opts.transactionId || null,
    action: opts.action,
    payload: opts.payload || null
  })
}

export function consumeAllocations(context: MatchContext, allocations: MatchAllocation[]) {
  for (const allocation of allocations) {
    const invoice = context.open.find(row => row.id === allocation.invoiceId)
    if (invoice) invoice.remaining_bani = Math.max(0, invoice.remaining_bani - allocation.amount_bani)
  }
}

export async function loadMatchContext(
  client: QueryClient,
  companyId: string,
  ownerUserId: string
): Promise<MatchContext> {
  const { data: company } = await client
    .from('companies')
    .select('invoice_series')
    .eq('id', companyId)
    .maybeSingle()
  const companyRow = company as { invoice_series?: string | null } | null
  const { open, linkable, seriesList } = await loadInvoices(client, companyId, ownerUserId)
  const rules = await loadRules(client, companyId, ownerUserId)
  return {
    open,
    linkable,
    seriesList,
    defaultSeries: String(companyRow?.invoice_series || seriesList[0] || 'FCT'),
    rules
  }
}

function engineCandidate(transaction: BankTransactionRow, context: MatchContext) {
  return matchBankTransaction({
    transaction: {
      amount_bani: toBani(Number(transaction.amount)),
      currency: String(transaction.currency || 'RON'),
      counterparty_name: String(transaction.counterparty_name || ''),
      counterparty_iban: String(transaction.counterparty_iban || ''),
      description: String(transaction.description || '')
    },
    invoices: context.open,
    seriesList: context.seriesList,
    defaultSeries: context.defaultSeries,
    rules: context.rules
  })
}

function resolveCandidate(transaction: BankTransactionRow, context: MatchContext) {
  const skipped = new Set<string>()
  let working = context
  let candidate = engineCandidate(transaction, working)
  for (let attempt = 0; attempt < 8 && candidate; attempt += 1) {
    const blocked = blockedInvoiceIds(working, candidate.allocations)
    if (blocked.size === 0) return { candidate, skipped }
    for (const id of blocked) skipped.add(id)
    working = contextWithout(context, skipped)
    candidate = engineCandidate(transaction, working)
  }
  return { candidate, skipped }
}

async function persistSuggestions(
  client: QueryClient,
  transaction: BankTransactionRow,
  actorUserId: string,
  candidate: MatchCandidate
) {
  const suggestions = candidate.allocations.map(allocation => ({
    user_id: transaction.user_id,
    company_id: transaction.company_id,
    created_by: actorUserId,
    bank_transaction_id: transaction.id,
    invoice_id: allocation.invoiceId,
    amount: fromBani(allocation.amount_bani),
    confidence: candidate.confidence,
    rule: candidate.rule
  }))
  if (suggestions.length) {
    const insert = await client.from('bank_match_suggestions').insert(suggestions)
    if (insert.error) throw new Error(insert.error.message)
  }
  await client.from('bank_transactions').update({ match_status: 'suggested' }).eq('id', transaction.id)
  return { status: 'suggested' as const, applied: false, candidate }
}

export async function applyMatchWithContext(
  client: QueryClient,
  opts: ApplyOpts & { transaction?: BankTransactionRow; context: MatchContext }
) {
  const transaction = opts.transaction || await loadTransaction(client, opts.transactionId)
  await assertCanAccess(client, opts.actorUserId, transaction.user_id)
  if (transaction.match_status === 'matched' || transaction.match_status === 'ignored') {
    return { status: transaction.match_status, applied: false }
  }

  const autoApply = opts.autoApply !== false
  const already = linkCandidate(transaction, opts.context)
  if (already) {
    if (!autoApply) {
      await client.from('bank_match_suggestions').delete().eq('bank_transaction_id', transaction.id)
      return persistSuggestions(client, transaction, opts.actorUserId, already)
    }
    const linked = await linkExistingAllocations(client, {
      transaction,
      invoiceIds: already.allocations.map(allocation => allocation.invoiceId)
    })
    if (linked) {
      await client.from('bank_match_suggestions').delete().eq('bank_transaction_id', transaction.id)
      await client.from('bank_transactions').update({ match_status: 'matched' }).eq('id', transaction.id)
      await logBankMatchEvent(client, {
        userId: transaction.user_id,
        companyId: transaction.company_id,
        actorUserId: opts.actorUserId,
        transactionId: transaction.id,
        action: 'auto_apply',
        payload: { rule: already.rule, confidence: already.confidence }
      })
      return { status: 'matched', applied: true, candidate: already }
    }
  }

  let { candidate, skipped } = resolveCandidate(transaction, opts.context)
  await client.from('bank_match_suggestions').delete().eq('bank_transaction_id', transaction.id)

  if (autoApply && candidate && candidate.auto) {
    try {
      await writeAllocations(client, {
        transaction,
        allocations: candidate.allocations,
        confidence: candidate.confidence,
        rule: candidate.rule,
        actorUserId: opts.actorUserId
      })
      consumeAllocations(opts.context, candidate.allocations)
      const status = candidate.overpayment_bani > 0 ? 'partially_matched' : 'matched'
      await client.from('bank_transactions').update({ match_status: status }).eq('id', transaction.id)
      await logBankMatchEvent(client, {
        userId: transaction.user_id,
        companyId: transaction.company_id,
        actorUserId: opts.actorUserId,
        transactionId: transaction.id,
        action: 'auto_apply',
        payload: { rule: candidate.rule, confidence: candidate.confidence, skipped: [...skipped] }
      })
      return { status, applied: true, candidate }
    } catch (error) {
      if (!isRemainingOverflow(error)) throw error
      const linked = await linkExistingAllocations(client, {
        transaction,
        invoiceIds: candidate.allocations.map(allocation => allocation.invoiceId)
      })
      if (linked) {
        await client.from('bank_transactions').update({ match_status: 'matched' }).eq('id', transaction.id)
        await logBankMatchEvent(client, {
          userId: transaction.user_id,
          companyId: transaction.company_id,
          actorUserId: opts.actorUserId,
          transactionId: transaction.id,
          action: 'auto_apply',
          payload: { rule: RULE.alreadyCollected, confidence: 95 }
        })
        return { status: 'matched', applied: true, candidate: { ...candidate, rule: RULE.alreadyCollected, auto: true } }
      }
      for (const allocation of candidate.allocations) skipped.add(allocation.invoiceId)
      candidate = engineCandidate(transaction, contextWithout(opts.context, skipped))
    }
  }

  if (candidate) return persistSuggestions(client, transaction, opts.actorUserId, candidate)

  await client.from('bank_transactions').update({ match_status: 'unmatched' }).eq('id', transaction.id)
  return { status: 'unmatched', applied: false, candidate: null }
}

export async function applyMatch(client: QueryClient, opts: ApplyOpts) {
  const transaction = await loadTransaction(client, opts.transactionId)
  const context = await loadMatchContext(client, transaction.company_id, transaction.user_id)
  return applyMatchWithContext(client, { ...opts, transaction, context })
}

async function detachTransactionPayments(client: QueryClient, transactionId: string) {
  const { data, error } = await client
    .from('invoice_payments')
    .select('id, match_rule')
    .eq('bank_transaction_id', transactionId)
  if (error) throw new Error(error.message)
  const rows = (data || []) as Array<{ id: string; match_rule?: string | null }>
  const unlink = rows.filter(row => row.match_rule === RULE.alreadyCollected).map(row => row.id)
  const remove = rows.filter(row => row.match_rule !== RULE.alreadyCollected).map(row => row.id)
  for (const paymentId of unlink) {
    const update = await client.from('invoice_payments').update({
      bank_transaction_id: null,
      match_confidence: null,
      match_rule: null
    }).eq('id', paymentId)
    if (update.error) throw new Error(update.error.message)
  }
  if (remove.length) {
    const del = await client.from('invoice_payments').delete().in('id', remove)
    if (del.error) throw new Error(del.error.message)
  }
}

export async function undoMatch(client: QueryClient, opts: ApplyOpts) {
  const transaction = await loadTransaction(client, opts.transactionId)
  await assertCanAccess(client, opts.actorUserId, transaction.user_id)
  await detachTransactionPayments(client, transaction.id)
  await client.from('bank_match_suggestions').delete().eq('bank_transaction_id', transaction.id)
  await client.from('bank_transactions').update({ match_status: 'unmatched', ignored_reason: null }).eq('id', transaction.id)
  await logBankMatchEvent(client, {
    userId: transaction.user_id,
    companyId: transaction.company_id,
    actorUserId: opts.actorUserId,
    transactionId: transaction.id,
    action: 'undo'
  })
  return { status: 'unmatched' }
}

export async function ignoreMatch(
  client: QueryClient,
  opts: ApplyOpts & { reason: string }
) {
  const transaction = await loadTransaction(client, opts.transactionId)
  await assertCanAccess(client, opts.actorUserId, transaction.user_id)
  await detachTransactionPayments(client, transaction.id)
  await client.from('bank_match_suggestions').delete().eq('bank_transaction_id', transaction.id)
  await client.from('bank_transactions').update({
    match_status: 'ignored',
    ignored_reason: opts.reason
  }).eq('id', transaction.id)
  await logBankMatchEvent(client, {
    userId: transaction.user_id,
    companyId: transaction.company_id,
    actorUserId: opts.actorUserId,
    transactionId: transaction.id,
    action: 'ignore',
    payload: { reason: opts.reason }
  })
  return { status: 'ignored' }
}

export async function undoAllocation(
  client: QueryClient,
  opts: { paymentId: string; actorUserId: string }
) {
  const { data, error } = await client.from('invoice_payments').select('*').eq('id', opts.paymentId).maybeSingle()
  if (error) throw new Error(error.message)
  const payment = data as { id: string; bank_transaction_id?: string | null; user_id: string; company_id: string; match_rule?: string | null } | null
  if (!payment) throw new Error('payment not found')
  if (!payment.bank_transaction_id) {
    await assertCanAccess(client, opts.actorUserId, payment.user_id)
    const del = await client.from('invoice_payments').delete().eq('id', payment.id)
    if (del.error) throw new Error(del.error.message)
    return { status: 'manual_removed' }
  }
  const { data: siblings } = await client
    .from('invoice_payments')
    .select('id')
    .eq('bank_transaction_id', payment.bank_transaction_id)
  if (((siblings || []) as Array<{ id: string }>).length <= 1) {
    return undoMatch(client, { transactionId: payment.bank_transaction_id, actorUserId: opts.actorUserId })
  }
  await assertCanAccess(client, opts.actorUserId, payment.user_id)
  if (payment.match_rule === RULE.alreadyCollected) {
    const unlink = await client.from('invoice_payments').update({
      bank_transaction_id: null,
      match_confidence: null,
      match_rule: null
    }).eq('id', payment.id)
    if (unlink.error) throw new Error(unlink.error.message)
  } else {
    const del = await client.from('invoice_payments').delete().eq('id', payment.id)
    if (del.error) throw new Error(del.error.message)
  }
  await client.from('bank_transactions').update({ match_status: 'partially_matched' }).eq('id', payment.bank_transaction_id)
  await logBankMatchEvent(client, {
    userId: payment.user_id,
    companyId: payment.company_id,
    actorUserId: opts.actorUserId,
    transactionId: payment.bank_transaction_id,
    action: 'reallocate',
    payload: { removedPaymentId: payment.id }
  })
  return { status: 'partially_matched' }
}

export async function confirmMatch(
  client: QueryClient,
  opts: ApplyOpts & { allocations: MatchAllocation[]; learnIban?: boolean }
) {
  const transaction = await loadTransaction(client, opts.transactionId)
  await assertCanAccess(client, opts.actorUserId, transaction.user_id)
  if (transaction.match_status === 'matched') {
    return { status: 'matched', applied: false }
  }
  await detachTransactionPayments(client, transaction.id)
  let paymentIds: string[] = []
  try {
    paymentIds = await writeAllocations(client, {
      transaction,
      allocations: opts.allocations,
      confidence: AUTO_APPLY_THRESHOLD,
      rule: 'manual_confirm',
      actorUserId: opts.actorUserId
    })
  } catch (error) {
    if (!isRemainingOverflow(error)) throw error
    let linked = await linkExistingAllocations(client, {
      transaction,
      invoiceIds: opts.allocations.map(allocation => allocation.invoiceId)
    })
    if (!linked) {
      const context = await loadMatchContext(client, transaction.company_id, transaction.user_id)
      const already = linkCandidate(transaction, context)
      linked = !!(already && await linkExistingAllocations(client, {
        transaction,
        invoiceIds: already.allocations.map(allocation => allocation.invoiceId)
      }))
    }
    if (!linked) throw error
    await client.from('bank_transactions').update({ match_status: 'matched' }).eq('id', transaction.id)
    await client.from('bank_match_suggestions').delete().eq('bank_transaction_id', transaction.id)
    await logBankMatchEvent(client, {
      userId: transaction.user_id,
      companyId: transaction.company_id,
      actorUserId: opts.actorUserId,
      transactionId: transaction.id,
      action: 'confirm',
      payload: { allocations: opts.allocations, rule: RULE.alreadyCollected }
    })
    return { status: 'matched', applied: true }
  }
  const txAbs = Math.abs(toBani(Number(transaction.amount)))
  const allocated = opts.allocations.reduce((sum, item) => sum + item.amount_bani, 0)
  const status = allocated < txAbs - 1 ? 'partially_matched' : 'matched'
  await client.from('bank_transactions').update({ match_status: status }).eq('id', transaction.id)
  await client.from('bank_match_suggestions').delete().eq('bank_transaction_id', transaction.id)

  const firstInvoiceId = opts.allocations[0]?.invoiceId
  const iban = normalizeIban(transaction.counterparty_iban)
  if (opts.learnIban !== false && iban && firstInvoiceId) {
    const { data: invoice } = await client
      .from('invoices')
      .select('client_id, clients(iban)')
      .eq('id', firstInvoiceId)
      .maybeSingle()
    const invoiceRow = invoice as { client_id?: string | null; clients?: InvoiceClientRel | InvoiceClientRel[] | null } | null
    const clientId = invoiceRow?.client_id
    if (clientId) {
      const { data: banks } = await client.from('client_bank_accounts').select('iban').eq('client_id', clientId)
      const known = [asClient(invoiceRow?.clients).iban, ...((banks || []) as Array<{ iban?: string }>).map(row => row.iban)]
        .some(value => sameIban(value, iban))
      const { data: existing } = await client
        .from('bank_match_rules')
        .select('id')
        .eq('company_id', transaction.company_id)
        .eq('client_id', clientId)
        .eq('counterparty_iban', iban)
        .maybeSingle()
      if (!known && !existing) {
        const tenant = await tenantWriteVerified(client, {
          userId: transaction.user_id,
          companyId: transaction.company_id,
          createdBy: opts.actorUserId
        })
        await client.from('bank_match_rules').insert({
          ...tenant,
          client_id: clientId,
          counterparty_iban: iban,
          counterparty_name_norm: normalizePartyName(transaction.counterparty_name) || null,
          created_from_payment_id: paymentIds[0] || null
        })
      }
    }
  }
  await logBankMatchEvent(client, {
    userId: transaction.user_id,
    companyId: transaction.company_id,
    actorUserId: opts.actorUserId,
    transactionId: transaction.id,
    action: 'confirm',
    payload: { allocations: opts.allocations }
  })
  return { status, applied: true }
}
