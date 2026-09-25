import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import { ibansEqual, normalizeIban } from '@/lib/iban'
import { applyImportedPayment, remainingMapFromInvoices, type CommitLine } from '@/lib/paymentImport'
import { getCompanyForActor } from '@/lib/portfolio'
import { isPurchaseInvoice } from '@/lib/invoiceStatus'
import { ensureConvertedInvoiceAmounts } from '@/lib/invoicePersist'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const userId = await authenticatedUserId(request)
    if (!userId) return unauthorized()
    const companyId = String(body.companyId || '')
    const allowIbanMismatch = body.allowIbanMismatch === true
    const lines = Array.isArray(body.lines) ? body.lines as CommitLine[] : []

    if (!userId || !companyId) {
      return NextResponse.json({ error: 'Lipsesc userId sau companyId.' }, { status: 400 })
    }
    if (lines.length === 0) {
      return NextResponse.json({ error: 'Nu ai selectat nicio linie de importat.' }, { status: 400 })
    }

    const company = await getCompanyForActor(supabase, companyId, userId)
    if (!company) {
      return NextResponse.json({ error: 'Firma nu a fost găsită.' }, { status: 404 })
    }

    const actionable = lines.filter(line => line.action === 'import' || line.action === 'unallocated')
    if (actionable.length === 0) {
      return NextResponse.json({ error: 'Nicio linie de importat. Omite sau alege facturi, apoi confirmă.' }, { status: 400 })
    }

    const companyIban = normalizeIban(company.iban)
    if (companyIban && !allowIbanMismatch) {
      const mismatch = actionable.some(line => {
        const stmt = normalizeIban(line.statementIban)
        return stmt && !ibansEqual(stmt, companyIban)
      })
      if (mismatch) {
        return NextResponse.json({
          error: 'IBAN-ul extrasului nu coincide cu IBAN-ul firmei active. Bifează confirmarea și reîncearcă.'
        }, { status: 400 })
      }
    }

    const { data: invoiceRows } = await supabase
      .from('invoices')
      .select('id, total, amount_paid, prepaid_amount, status, company_id, invoice_type_code, notes, exchange_rate, subtotal, invoice_items(quantity, unit_price, tva_rate, total)')
      .eq('user_id', company.user_id)
      .eq('company_id', companyId)

    const open = await Promise.all(
      (invoiceRows || [])
        .filter(row => row.invoice_type_code !== '381' && !isPurchaseInvoice(row))
        .map(row => ensureConvertedInvoiceAmounts(supabase, row))
    )
    const { remaining, meta } = remainingMapFromInvoices(open)

    const results = []
    for (const line of lines) {
      const normalized: CommitLine = {
        ...line,
        amount: Number(line.amount),
        fingerprint: String(line.fingerprint || ''),
        paidOn: String(line.paidOn || ''),
        action: line.action
      }
      if (!normalized.fingerprint) {
        results.push({ fingerprint: '', outcome: 'error', invoiceId: null, error: 'Lipsește amprenta tranzacției.' })
        continue
      }
      const result = await applyImportedPayment(supabase, {
        userId: company.user_id,
        companyId,
        line: normalized,
        remainingByInvoice: remaining,
        invoiceMeta: meta
      })
      results.push(result)
    }

    const imported = results.filter(r => r.outcome === 'imported').length
    const unallocated = results.filter(r => r.outcome === 'unallocated').length
    const duplicates = results.filter(r => r.outcome === 'duplicate').length
    const errors = results.filter(r => r.outcome === 'error').length
    const skipped = results.filter(r => r.outcome === 'skipped').length

    return NextResponse.json({
      imported,
      unallocated,
      duplicates,
      errors,
      skipped,
      results
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare la import'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
