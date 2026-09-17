import { notesWithoutSpvMark } from '@/lib/invoiceStatus'
import { DEFAULT_DUE_DAYS } from '@/lib/dates'
import { normalizeIban } from '@/lib/iban'

export const VAT_ON_COLLECTION_MENTION = 'TVA la încasare'

export function defaultInvoiceNotes(seller: {
  iban?: string | null
  bic?: string | null
  vat_on_collection?: boolean | null
}, dueDays = DEFAULT_DUE_DAYS) {
  const lines = [`Plata în ${dueDays} zile calendaristice prin virament bancar.`]
  const iban = normalizeIban(seller.iban || '')
  if (iban) lines.push(`IBAN: ${iban}`)
  if (seller.bic) lines.push(`BIC: ${seller.bic}`)
  if (seller.vat_on_collection) lines.push(VAT_ON_COLLECTION_MENTION)
  return lines.join('\n')
}

export function withVatOnCollectionMention(notes: string | null | undefined, enabled?: boolean | null) {
  const text = notes || ''
  if (!enabled) return text
  if (text.includes(VAT_ON_COLLECTION_MENTION)) return text
  return text ? `${text}\n${VAT_ON_COLLECTION_MENTION}` : VAT_ON_COLLECTION_MENTION
}

export function publicInvoiceNotes(notes?: string | null) {
  return notesWithoutSpvMark(notes)
}
