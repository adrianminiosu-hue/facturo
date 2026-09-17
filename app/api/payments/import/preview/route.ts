import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseMulticash940 } from '@/lib/multicash940'
import { asOpenInvoice, matchPayments, type ExistingPayment } from '@/lib/paymentMatch'
import { OPEN_INVOICE_STATUSES } from '@/lib/invoiceStatus'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export const runtime = 'nodejs'

const MAX_XML_CHARS = 1_500_000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const userId = String(body.userId || '')
    const companyId = String(body.companyId || '')
    const xml = String(body.xml || '')
    if (!userId || !companyId) {
      return NextResponse.json({ error: 'Lipsesc userId sau companyId.' }, { status: 400 })
    }
    if (!xml.trim()) {
      return NextResponse.json({ error: 'Încarcă un fișier XML.' }, { status: 400 })
    }
    if (xml.length > MAX_XML_CHARS) {
      return NextResponse.json({ error: 'Fișierul este prea mare (max. ~1.5 MB).' }, { status: 400 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id, user_id, iban, company_name')
      .eq('id', companyId)
      .eq('user_id', userId)
      .single()
    if (!company) {
      return NextResponse.json({ error: 'Firma nu a fost găsită.' }, { status: 404 })
    }

    const parsed = parseMulticash940(xml)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { data: invoiceRows, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, company_id, client_id, series, invoice_number, due_date, issue_date, total, amount_paid, prepaid_amount, status, currency, invoice_type_code, clients(company_name, cui, iban)')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .in('status', [...OPEN_INVOICE_STATUSES])

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 400 })
    }

    const invoices = (invoiceRows || [])
      .map(row => asOpenInvoice(row as Record<string, unknown>))
      .filter(inv => inv.invoice_type_code !== '381')

    let existing: ExistingPayment[] = []
    const full = await supabase
      .from('invoice_payments')
      .select('id, invoice_id, amount, paid_on, reference, fingerprint, bank_txn_id, counterpart_iban, method')
      .eq('user_id', userId)
    if (full.error) {
      const fallback = await supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_on, reference, method')
        .eq('user_id', userId)
      existing = (fallback.data || []) as ExistingPayment[]
    } else {
      existing = (full.data || []) as ExistingPayment[]
    }

    const allTxns = parsed.statements.flatMap(s => s.transactions)
    const matched = matchPayments({
      txns: allTxns,
      invoices,
      existing,
      companyIban: company.iban || ''
    })

    return NextResponse.json({
      warnings: [
        ...parsed.warnings,
        ...(matched.ibanWarning ? [matched.ibanWarning] : [])
      ],
      ibanMismatch: matched.ibanMismatch,
      companyIban: company.iban || '',
      companyName: company.company_name || '',
      statementIbans: Array.from(new Set(parsed.statements.map(s => s.accountIban).filter(Boolean))),
      rows: matched.rows,
      invoices,
      skippedDebits: parsed.skipped.filter(t => t.direction === 'debit').length
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare la citirea extrasului'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
