import type { SupabaseClient } from '@supabase/supabase-js'
import { isDraftInvoice, notesWithSpvMark } from '@/lib/invoiceStatus'

export type SpvInvoicePatch = {
  status?: string | null
  efactura_status?: string | null
  notes?: string | null
  efactura_index?: string | null
  efactura_error?: string | null
  efactura_environment?: string | null
}

async function tryUpdate(
  client: SupabaseClient,
  id: string,
  patch: Record<string, unknown>
) {
  const { error } = await client.from('invoices').update(patch).eq('id', id)
  return !error
}

export async function persistEfacturaState(
  client: SupabaseClient,
  invoice: { id: string; status?: string | null; notes?: string | null },
  input: {
    efactura_status: string
    efactura_index?: string | null
    efactura_error?: string | null
    efactura_environment?: string | null
  }
): Promise<SpvInvoicePatch> {
  const accepted = input.efactura_status === 'accepted'
  const keepStatus = isDraftInvoice(invoice.status) || invoice.status === 'paid'
  const notes = accepted ? notesWithSpvMark(invoice.notes) : invoice.notes
  const uploadedAt = new Date().toISOString()
  const core = {
    efactura_status: input.efactura_status,
    efactura_error: input.efactura_error ?? null,
    efactura_uploaded_at: uploadedAt,
    ...(input.efactura_index !== undefined ? { efactura_index: input.efactura_index } : {}),
    ...(input.efactura_environment ? { efactura_environment: input.efactura_environment } : {})
  }
  const withNotes = accepted ? { ...core, notes } : core
  const withStatus = accepted && !keepStatus ? { ...withNotes, status: 'spv' } : withNotes

  if (await tryUpdate(client, invoice.id, withStatus)) {
    return {
      status: accepted && !keepStatus ? 'spv' : invoice.status,
      efactura_status: input.efactura_status,
      notes: accepted ? notes : invoice.notes,
      efactura_index: input.efactura_index ?? null,
      efactura_error: input.efactura_error ?? null,
      efactura_environment: input.efactura_environment ?? null
    }
  }

  if (accepted) {
    return persistSpvAccepted(client, invoice)
  }

  throw new Error('Statusul e-Factura nu a putut fi salvat.')
}

export async function persistSpvAccepted(
  client: SupabaseClient,
  invoice: { id: string; status?: string | null; notes?: string | null },
  extra?: { efactura_index?: string | null; efactura_environment?: string | null }
): Promise<SpvInvoicePatch> {
  const keepStatus = isDraftInvoice(invoice.status) || invoice.status === 'paid'
  const nextStatus = keepStatus ? invoice.status : 'spv'
  const notes = notesWithSpvMark(invoice.notes)
  const uploadedAt = new Date().toISOString()
  const accepted = {
    efactura_status: 'accepted',
    efactura_error: null,
    efactura_uploaded_at: uploadedAt,
    ...(extra?.efactura_index ? { efactura_index: extra.efactura_index } : {}),
    ...(extra?.efactura_environment ? { efactura_environment: extra.efactura_environment } : {})
  }

  if (await tryUpdate(client, invoice.id, {
    ...accepted,
    notes,
    ...(keepStatus ? {} : { status: 'spv' })
  })) {
    return { status: nextStatus, efactura_status: 'accepted', notes, ...extra }
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
