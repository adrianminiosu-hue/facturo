import type { SupabaseClient } from '@supabase/supabase-js'
import { isDraftInvoice, notesWithSpvMark } from '@/lib/invoiceStatus'

export type SpvInvoicePatch = {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
}

export async function persistSpvAccepted(
  client: SupabaseClient,
  invoice: { id: string; status?: string | null; notes?: string | null }
): Promise<SpvInvoicePatch> {
  const keepStatus = isDraftInvoice(invoice.status) || invoice.status === 'paid'
  const withColumns: Record<string, unknown> = {
    efactura_status: 'accepted',
    efactura_error: null,
    efactura_uploaded_at: new Date().toISOString()
  }
  if (!keepStatus) withColumns.status = 'spv'

  const full = await client.from('invoices').update(withColumns).eq('id', invoice.id)
  if (!full.error) {
    return {
      status: keepStatus ? invoice.status : 'spv',
      efactura_status: 'accepted',
      notes: invoice.notes
    }
  }

  if (!keepStatus) {
    const statusOnly = await client.from('invoices').update({ status: 'spv' }).eq('id', invoice.id)
    if (!statusOnly.error) {
      return { status: 'spv', notes: invoice.notes }
    }
  }

  const efacturaOnly = await client.from('invoices').update({
    efactura_status: 'accepted',
    efactura_error: null,
    efactura_uploaded_at: new Date().toISOString()
  }).eq('id', invoice.id)
  if (!efacturaOnly.error) {
    return { status: invoice.status, efactura_status: 'accepted', notes: invoice.notes }
  }

  const notes = notesWithSpvMark(invoice.notes)
  const noteUpdate = await client.from('invoices').update({ notes }).eq('id', invoice.id)
  if (noteUpdate.error) {
    throw new Error(noteUpdate.error.message)
  }
  return { status: invoice.status, notes }
}
