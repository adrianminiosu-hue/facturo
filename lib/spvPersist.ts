import type { SupabaseClient } from '@supabase/supabase-js'
import { isDraftInvoice, notesWithSpvMark } from '@/lib/invoiceStatus'

export type SpvInvoicePatch = {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
}

async function tryUpdate(
  client: SupabaseClient,
  id: string,
  patch: Record<string, unknown>
) {
  const { error } = await client.from('invoices').update(patch).eq('id', id)
  return !error
}

export async function persistSpvAccepted(
  client: SupabaseClient,
  invoice: { id: string; status?: string | null; notes?: string | null }
): Promise<SpvInvoicePatch> {
  const keepStatus = isDraftInvoice(invoice.status) || invoice.status === 'paid'
  const nextStatus = keepStatus ? invoice.status : 'spv'
  const notes = notesWithSpvMark(invoice.notes)
  const uploadedAt = new Date().toISOString()
  const accepted = {
    efactura_status: 'accepted',
    efactura_error: null,
    efactura_uploaded_at: uploadedAt
  }

  if (await tryUpdate(client, invoice.id, {
    ...accepted,
    notes,
    ...(keepStatus ? {} : { status: 'spv' })
  })) {
    return { status: nextStatus, efactura_status: 'accepted', notes }
  }

  if (!keepStatus && await tryUpdate(client, invoice.id, { status: 'spv', notes })) {
    return { status: 'spv', notes }
  }

  if (await tryUpdate(client, invoice.id, { ...accepted, notes })) {
    return { status: invoice.status, efactura_status: 'accepted', notes }
  }

  if (await tryUpdate(client, invoice.id, accepted)) {
    return { status: invoice.status, efactura_status: 'accepted' }
  }

  if (await tryUpdate(client, invoice.id, { notes })) {
    return { status: invoice.status, notes }
  }

  if (!keepStatus && await tryUpdate(client, invoice.id, { status: 'spv' })) {
    return { status: 'spv' }
  }

  throw new Error('Statusul SPV nu a putut fi salvat.')
}
