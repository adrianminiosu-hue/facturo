import { generateEfacturaXml } from '@/lib/efactura'
import { loadBuyer } from '@/lib/loadBuyer'
import { loadSeller } from '@/lib/loadSeller'
import { resolveParty } from '@/lib/partySnapshot'

// Service-role client; the invoice was already access-checked by the caller.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * The one place that turns a stored invoice into its e-Factura XML, so the file you download,
 * the file ANAF validates and the file that is uploaded are always identical.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildInvoiceXml(db: Db, invoice: any) {
  const { data: items } = await db.from('invoice_items').select('*').eq('invoice_id', invoice.id)
  const liveClient = await loadBuyer(db, invoice.client_id)
  if (!liveClient && !invoice.buyer_snapshot) throw new Error('Clientul nu a fost găsit')
  const liveSeller = await loadSeller(db, invoice, invoice.user_id)
  const seller = resolveParty(invoice.seller_snapshot, liveSeller)
  const buyer = resolveParty(invoice.buyer_snapshot, liveClient)

  // Storno / corrective invoices reference the invoice they correct (BT-25 / BT-26).
  let billing_reference: string | null = null
  let billing_reference_date: string | null = null
  if (invoice.credited_invoice_id) {
    const { data: original } = await db
      .from('invoices')
      .select('series, invoice_number, issue_date')
      .eq('id', invoice.credited_invoice_id)
      .single()
    if (original) {
      billing_reference = `${original.series}${original.invoice_number}`
      billing_reference_date = original.issue_date
    }
  }

  const xml = generateEfacturaXml({
    invoice: { ...invoice, billing_reference, billing_reference_date },
    seller,
    buyer,
    items: items || []
  })
  return { xml, seller, buyer }
}
