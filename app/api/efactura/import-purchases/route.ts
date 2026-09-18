import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  simulatedPurchaseInvoices,
  spvListEndpoint,
  SPV_PURCHASE_NOTE,
  type PurchaseBuyer
} from '@/lib/efacturaPurchaseImport'
import { registerSimulatedPurchaseInvoices } from '@/lib/purchaseInvoicePersist'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function loadBuyer(userId: string, companyId?: string | null): Promise<PurchaseBuyer & { user_id?: string }> {
  if (companyId) {
    const { data } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle()
    if (data) return data
  }
  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if (companies?.[0]) return companies[0]

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return profile || { company_name: 'Firma ta', cui: '', user_id: userId }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, companyId, company } = await request.json()
    if (!userId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const stored = await loadBuyer(userId, companyId)
    const resolvedCompanyId = companyId || ((stored as { user_id?: string }).user_id ? stored.id : null) || null
    const buyer: PurchaseBuyer = {
      ...stored,
      id: resolvedCompanyId || stored.id || userId,
      company_name: company?.company_name || stored.company_name,
      cui: company?.cui || stored.cui,
      address: company?.address || stored.address,
      city: company?.city || stored.city
    }
    await delay(900)
    const simulated = simulatedPurchaseInvoices(buyer)
    const registered = await registerSimulatedPurchaseInvoices(supabase, {
      userId,
      ownerUserId: stored.user_id || userId,
      companyId: resolvedCompanyId,
      buyer,
      invoices: simulated
    })

    return NextResponse.json({
      simulated: true,
      environment: 'test',
      endpoint: spvListEndpoint(buyer.cui),
      buyerName: registered.invoices[0]?.buyerName || buyer.company_name,
      buyerCui: registered.invoices[0]?.buyerCui,
      count: registered.invoices.length,
      added: registered.added,
      skipped: registered.skipped,
      catalogInserted: registered.catalogInserted,
      note: SPV_PURCHASE_NOTE,
      invoices: registered.invoices
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare interogare e-Factura'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
