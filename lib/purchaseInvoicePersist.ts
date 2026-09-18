import { inferLegalForm } from '@/lib/legalForms'
import { computeInvoiceTotals } from '@/lib/invoiceMath'
import { insertInvoiceRow, invoicePartySnapshots } from '@/lib/invoicePersist'
import { tenantWrite } from '@/lib/portfolio'
import { isPurchaseInvoice, notesWithPurchaseMark } from '@/lib/invoiceStatus'
import { numericCif, sealFor, type PurchaseBuyer, type SimulatedPurchaseInvoice } from '@/lib/efacturaPurchaseImport'
import { unitLabel } from '@/lib/efactura'
import { importCatalogFromPurchaseLines, type PurchaseCatalogLine } from '@/lib/catalog'

type QueryClient = { from: (table: string) => any }

function unitCodeFromSim(unit: string) {
  const value = unit.toUpperCase()
  if (value === 'LUN') return 'MON'
  if (value === 'TOP') return 'H87'
  return 'H87'
}

function splitAddress(full: string) {
  const parts = String(full || '').split(',').map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) return { address: full || '', city: '' }
  return { address: parts.slice(0, -1).join(', '), city: parts[parts.length - 1] }
}

function signedAtFor(invoice: { efactura_uploaded_at?: string | null; issue_date?: string | null }) {
  if (invoice.efactura_uploaded_at) return invoice.efactura_uploaded_at
  return `${invoice.issue_date || ''}T12:00:00+03:00`
}

export function purchaseInvoiceFromRow(input: {
  invoice: Record<string, any>
  items?: Array<Record<string, any>> | null
  supplier?: Record<string, any> | null
  buyer?: PurchaseBuyer | null
}): SimulatedPurchaseInvoice {
  const invoice = input.invoice
  const supplier = input.supplier || invoice.clients || invoice.seller_snapshot || {}
  const buyerSnap = invoice.buyer_snapshot || input.buyer || {}
  const items = input.items || invoice.invoice_items || []
  const indexIncarcare = String(invoice.efactura_index || '')
  return {
    id: String(invoice.id),
    indexIncarcare,
    idDescarcare: String(invoice.buyer_reference || (indexIncarcare ? `${indexIncarcare}1` : '')),
    supplierName: String(supplier.company_name || ''),
    supplierCui: supplier.cui ? (String(supplier.cui).startsWith('RO') ? String(supplier.cui) : `RO${numericCif(supplier.cui)}`) : '',
    supplierAddress: [supplier.address, supplier.city].filter(Boolean).join(', '),
    buyerName: String(buyerSnap.company_name || input.buyer?.company_name || ''),
    buyerCui: String(buyerSnap.cui || input.buyer?.cui || ''),
    buyerAddress: [buyerSnap.address, buyerSnap.city].filter(Boolean).join(', ') || String(input.buyer?.address || ''),
    series: String(invoice.series || ''),
    invoiceNumber: String(invoice.invoice_number || ''),
    issueDate: String(invoice.issue_date || ''),
    dueDate: String(invoice.due_date || invoice.issue_date || ''),
    currency: 'RON',
    lines: items.map(item => ({
      description: String(item.description || ''),
      quantity: Number(item.quantity || 0),
      unit: unitLabel(item.unit_code) || String(item.unit_code || 'BUC'),
      unitPrice: Number(item.unit_price || 0),
      vatRate: Number(item.tva_rate || 0)
    })),
    subtotal: Number(invoice.subtotal || 0),
    vat: Number(invoice.tva_amount || 0),
    total: Number(invoice.total || 0),
    seal: sealFor(String(invoice.id), signedAtFor(invoice))
  }
}

async function findOrCreateSupplier(
  client: QueryClient,
  opts: {
    ownerUserId: string
    actorUserId: string
    companyId?: string | null
    supplierName: string
    supplierCui: string
    supplierAddress: string
  }
) {
  const cui = numericCif(opts.supplierCui)
  let query = client.from('clients').select('*')
  query = opts.companyId ? query.eq('company_id', opts.companyId) : query.eq('user_id', opts.ownerUserId)
  const { data: rows } = await query
  const existing = (rows || []).find((row: { cui?: string; company_name?: string }) => {
    const rowCui = numericCif(row.cui)
    if (cui && cui !== '00000000' && rowCui === cui) return true
    return String(row.company_name || '').trim() === opts.supplierName
  })
  if (existing) return existing

  const place = splitAddress(opts.supplierAddress)
  const payload: Record<string, unknown> = {
    ...tenantWrite({ ownerUserId: opts.ownerUserId, actorUserId: opts.actorUserId, companyId: opts.companyId }),
    company_name: opts.supplierName,
    cui,
    address: place.address,
    city: place.city,
    country: 'RO',
    vat_registered: true,
    legal_form: inferLegalForm(opts.supplierName)
  }
  let { data, error } = await client.from('clients').insert(payload).select('*').single()
  if (error && String(error.message || '').toLowerCase().includes('legal_form')) {
    delete payload.legal_form
    const retry = await client.from('clients').insert(payload).select('*').single()
    data = retry.data
    error = retry.error
  }
  if (error && String(error.message || '').toLowerCase().includes('created_by')) {
    delete payload.created_by
    const retry = await client.from('clients').insert(payload).select('*').single()
    data = retry.data
    error = retry.error
  }
  if (error || !data) throw new Error(error?.message || 'Furnizorul nu a putut fi înregistrat.')
  return data
}

async function loadPurchaseRows(
  client: QueryClient,
  opts: { ownerUserId: string; companyId?: string | null }
) {
  let query = client
    .from('invoices')
    .select('*, clients(*), invoice_items(*)')
  query = opts.companyId ? query.eq('company_id', opts.companyId) : query.eq('user_id', opts.ownerUserId)
  const { data } = await query
  return ((data || []) as Record<string, any>[]).filter(isPurchaseInvoice)
}

async function insertRegisteredPurchase(
  client: QueryClient,
  row: Record<string, unknown>
) {
  let result = await insertInvoiceRow(client, { ...row, status: 'spv' })
  const message = String(result.error?.message || '').toLowerCase()
  if (result.error && (message.includes('status') || message.includes('check'))) {
    result = await insertInvoiceRow(client, { ...row, status: 'sent' })
  }
  return result
}

export async function registerSimulatedPurchaseInvoices(
  client: QueryClient,
  opts: {
    userId: string
    ownerUserId: string
    companyId?: string | null
    buyer: PurchaseBuyer
    invoices: SimulatedPurchaseInvoice[]
  }
) {
  const registered: SimulatedPurchaseInvoice[] = []
  let added = 0
  let skipped = 0
  const catalogLines: PurchaseCatalogLine[] = []

  const existingRows = await loadPurchaseRows(client, {
    ownerUserId: opts.ownerUserId,
    companyId: opts.companyId
  })

  for (const invoice of opts.invoices) {
    const existing = existingRows.find(row => {
      if (row.series === invoice.series && String(row.invoice_number) === invoice.invoiceNumber) return true
      return !!invoice.indexIncarcare && row.efactura_index === invoice.indexIncarcare
    })
    if (existing) {
      skipped += 1
      registered.push(purchaseInvoiceFromRow({ invoice: existing, buyer: opts.buyer }))
      for (const item of existing.invoice_items || []) catalogLines.push(item)
      continue
    }

    const supplier = await findOrCreateSupplier(client, {
      ownerUserId: opts.ownerUserId,
      actorUserId: opts.userId,
      companyId: opts.companyId,
      supplierName: invoice.supplierName,
      supplierCui: invoice.supplierCui,
      supplierAddress: invoice.supplierAddress
    })

    const totals = computeInvoiceTotals(
      invoice.lines.map(line => ({
        quantity: line.quantity,
        unit_price: line.unitPrice,
        tva_rate: line.vatRate
      }))
    )

    const { data: created, error } = await insertRegisteredPurchase(client, {
      ...tenantWrite({
        ownerUserId: opts.ownerUserId,
        actorUserId: opts.userId,
        companyId: opts.companyId
      }),
      client_id: supplier.id,
      invoice_number: invoice.invoiceNumber,
      series: invoice.series,
      issue_date: invoice.issueDate,
      due_date: invoice.dueDate,
      subtotal: totals.subtotal,
      tva_rate: invoice.lines[0]?.vatRate ?? 19,
      tva_amount: totals.tvaAmount,
      total: totals.taxInclusive,
      notes: notesWithPurchaseMark('Înregistrată din e-Factura SPV (simulare test).'),
      invoice_type_code: '380',
      currency: 'RON',
      payment_means_code: '42',
      tax_point_date: invoice.issueDate,
      delivery_date: invoice.issueDate,
      buyer_reference: invoice.idDescarcare,
      efactura_status: 'accepted',
      efactura_index: invoice.indexIncarcare,
      efactura_environment: 'test',
      efactura_uploaded_at: invoice.seal.signedAt,
      direction: 'purchase',
      ...invoicePartySnapshots({
        status: 'sent',
        seller: supplier,
        buyer: opts.buyer as Record<string, unknown>
      })
    })

    if (error || !created) {
      const message = String(error?.message || '').toLowerCase()
      if (error && (message.includes('duplicate') || message.includes('unique') || error.code === '23505')) {
        skipped += 1
        const again = (await loadPurchaseRows(client, { ownerUserId: opts.ownerUserId, companyId: opts.companyId }))
          .find(row => row.series === invoice.series && String(row.invoice_number) === invoice.invoiceNumber)
        if (again) {
          registered.push(purchaseInvoiceFromRow({ invoice: again, buyer: opts.buyer }))
          for (const item of again.invoice_items || []) catalogLines.push(item)
        }
        continue
      }
      throw new Error(error?.message || `Factura ${invoice.series}${invoice.invoiceNumber} nu a putut fi înregistrată.`)
    }

    const itemRows = invoice.lines.map((line, index) => ({
      invoice_id: created.id,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      tva_rate: line.vatRate,
      total: totals.lines[index]?.total ?? line.quantity * line.unitPrice,
      unit_code: unitCodeFromSim(line.unit),
      vat_category: 'S',
      discount_percent: 0
    }))
    const itemsInsert = await client.from('invoice_items').insert(itemRows)
    if (itemsInsert.error) {
      throw new Error(itemsInsert.error.message || 'Liniile facturii nu au putut fi salvate.')
    }

    added += 1
    catalogLines.push(...itemRows)
    registered.push(purchaseInvoiceFromRow({
      invoice: created,
      items: itemRows,
      supplier,
      buyer: opts.buyer
    }))
  }

  const catalog = await importCatalogFromPurchaseLines(client, {
    userId: opts.ownerUserId,
    actorUserId: opts.userId,
    companyId: opts.companyId,
    lines: catalogLines
  })

  registered.sort((a, b) => b.issueDate.localeCompare(a.issueDate))
  return { invoices: registered, added, skipped, catalogInserted: catalog.inserted || 0 }
}

export async function loadRegisteredPurchaseInvoice(
  client: QueryClient,
  invoiceId: string
) {
  const { data } = await client
    .from('invoices')
    .select('*, clients(*), invoice_items(*)')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!data || !isPurchaseInvoice(data)) return null
  return data
}
