import { calendarDateInBucharest, defaultDueDate } from '@/lib/dates'
import { nextInvoiceNumber } from '@/lib/invoiceNumber'
import { computeInvoiceTotals } from '@/lib/invoiceMath'
import { insertInvoiceRow, invoicePartySnapshots } from '@/lib/invoicePersist'
import { isCreditNote, isDraftInvoice, notesWithoutSpvMark } from '@/lib/invoiceStatus'
import type { SupabaseClient } from '@supabase/supabase-js'

type Line = {
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  tva_rate?: number | null
  total?: number | null
  unit_code?: string | null
  vat_category?: string | null
  vat_exemption_reason?: string | null
  discount_percent?: number | null
}

export type CloneInvoice = {
  id: string
  company_id?: string | null
  client_id?: string | null
  series: string
  invoice_number: string
  status?: string | null
  subtotal?: number | null
  tva_rate?: number | null
  tva_amount?: number | null
  total?: number | null
  notes?: string | null
  invoice_type_code?: string | null
  payment_means_code?: string | null
  buyer_reference?: string | null
  order_reference?: string | null
  period_start?: string | null
  period_end?: string | null
  discount_percent?: number | null
  clients?: Record<string, unknown> | null
  invoice_items?: Line[] | null
}

type CompanySource = {
  id?: string
  invoice_series?: string | null
  invoice_start_number?: number | null
} | null

function lineRows(invoiceId: string, items: Line[], totals?: ReturnType<typeof computeInvoiceTotals>) {
  return items.map((item, index) => ({
    invoice_id: invoiceId,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    tva_rate: item.tva_rate,
    total: totals?.lines[index]?.total ?? item.total,
    unit_code: item.unit_code || 'H87',
    vat_category: item.vat_category || null,
    vat_exemption_reason: item.vat_exemption_reason || null,
    discount_percent: item.discount_percent || 0
  }))
}

export function canCreateStorno(invoice: {
  status?: string | null
  invoice_type_code?: string | null
}, hasStorno: boolean) {
  return !isDraftInvoice(invoice.status) && !isCreditNote(invoice.invoice_type_code) && !hasStorno
}

export async function loadInvoiceForClone(client: SupabaseClient, id: string): Promise<CloneInvoice> {
  const { data, error } = await client
    .from('invoices')
    .select('*, clients(*), invoice_items(*)')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(error?.message || 'Factura nu a fost găsită.')
  return data as CloneInvoice
}

export async function copyInvoiceAsDraft(
  client: SupabaseClient,
  opts: { invoice: CloneInvoice; company: CompanySource; userId: string }
) {
  const { invoice, company, userId } = opts
  const series = company?.invoice_series || invoice.series
  const invoice_number = await nextInvoiceNumber(client, {
    series,
    companyId: company?.id || invoice.company_id,
    userId,
    startNumber: company?.invoice_start_number ?? undefined
  })
  const today = calendarDateInBucharest(0)
  const items = invoice.invoice_items || []
  const totals = computeInvoiceTotals(items, invoice)
  const { data: created, error } = await insertInvoiceRow(client, {
    user_id: userId,
    company_id: invoice.company_id || company?.id || null,
    client_id: invoice.client_id,
    series,
    invoice_number,
    issue_date: today,
    due_date: defaultDueDate(today),
    status: 'draft',
    subtotal: totals.subtotal,
    tva_rate: invoice.tva_rate ?? items[0]?.tva_rate ?? 21,
    tva_amount: totals.tvaAmount,
    total: totals.total,
    notes: notesWithoutSpvMark(invoice.notes),
    invoice_type_code: invoice.invoice_type_code === '381' ? '380' : (invoice.invoice_type_code || '380'),
    currency: 'RON',
    payment_means_code: invoice.payment_means_code || '42',
    tax_point_date: today,
    delivery_date: today,
    buyer_reference: invoice.buyer_reference || null,
    order_reference: invoice.order_reference || null,
    period_start: invoice.period_start || null,
    period_end: invoice.period_end || null,
    discount_percent: Number(invoice.discount_percent || 0),
    prepaid_amount: 0,
    ...invoicePartySnapshots({
      status: 'draft',
      seller: company as unknown as Record<string, unknown>,
      buyer: invoice.clients as unknown as Record<string, unknown>
    })
  })
  if (error || !created) throw new Error(error?.message || 'Nu s-a putut copia factura.')
  if (items.length) {
    const { error: itemsError } = await client.from('invoice_items').insert(lineRows(created.id, items, totals))
    if (itemsError) throw new Error(itemsError.message)
  }
  return created as { id: string }
}

export async function createStornoDraft(
  client: SupabaseClient,
  opts: { invoice: CloneInvoice; company: CompanySource; userId: string }
) {
  const { invoice, company, userId } = opts
  const series = company?.invoice_series || invoice.series
  const invoice_number = await nextInvoiceNumber(client, {
    series,
    companyId: company?.id || invoice.company_id,
    userId,
    startNumber: company?.invoice_start_number ?? undefined
  })
  const today = calendarDateInBucharest(0)
  const { data: created, error } = await insertInvoiceRow(client, {
    user_id: userId,
    company_id: invoice.company_id || company?.id || null,
    client_id: invoice.client_id,
    series,
    invoice_number,
    issue_date: today,
    due_date: today,
    tax_point_date: today,
    delivery_date: today,
    status: 'draft',
    subtotal: invoice.subtotal,
    tva_amount: invoice.tva_amount,
    total: invoice.total,
    notes: `Storno pentru ${invoice.series}${invoice.invoice_number}`,
    invoice_type_code: '381',
    currency: 'RON',
    payment_means_code: '42',
    credited_invoice_id: invoice.id,
    discount_percent: invoice.discount_percent || 0,
    prepaid_amount: 0
  })
  if (error || !created) throw new Error(error?.message || 'Nu s-a putut crea stornoul. Rulează migrarea storno în Supabase.')
  const items = invoice.invoice_items || []
  if (items.length) {
    const { error: itemsError } = await client.from('invoice_items').insert(lineRows(created.id, items))
    if (itemsError) throw new Error(itemsError.message)
  }
  return created as { id: string }
}
