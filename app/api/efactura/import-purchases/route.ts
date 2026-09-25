import { NextRequest, NextResponse } from 'next/server'
import { getCompanyForActor } from '@/lib/portfolio'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import {
  simulatedPurchaseInvoices,
  spvListEndpoint,
  SPV_PURCHASE_NOTE,
  type PurchaseBuyer
} from '@/lib/efacturaPurchaseImport'
import { registerSimulatedPurchaseInvoices } from '@/lib/purchaseInvoicePersist'
import { ANAF_CONNECT_ERROR, anafEfacturaEnvironment, anafEfacturaMode, anafEnvironmentLabel, getValidAccessToken } from '@/lib/anafOAuth'
import { importSpvPurchases } from '@/lib/spvPurchaseImport'

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

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request)
    if (!userId) return unauthorized()
    const { companyId, company } = await request.json()
    if (companyId && !(await getCompanyForActor(supabase, companyId, userId))) {
      return NextResponse.json({ error: 'Nu ai acces la această firmă.' }, { status: 403 })
    }
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
    // Real SPV import (test or production API).
    if (anafEfacturaMode() !== 'simulate') {
      const ownerUserId = stored.user_id || userId
      const tokens = await getValidAccessToken(ownerUserId, 'test')
      if (!tokens?.access_token) {
        return NextResponse.json({ error: ANAF_CONNECT_ERROR, code: 'ANAF_CONNECT' }, { status: 401 })
      }
      const imported = await importSpvPurchases(supabase, {
        accessToken: tokens.access_token,
        userId,
        ownerUserId,
        companyId: resolvedCompanyId,
        buyer
      })
      const noteParts = [
        `SPV ${anafEnvironmentLabel()}: ${imported.total} facturi primite în ultimele 60 de zile.`,
        imported.remaining ? `Încă ${imported.remaining} de descărcat — apasă din nou pe import.` : '',
        imported.failed.length ? `${imported.failed.length} nu au putut fi citite: ${imported.failed.map(f => `${f.messageId} (${f.error})`).join('; ')}` : ''
      ].filter(Boolean)
      return NextResponse.json({
        simulated: false,
        environment: anafEfacturaEnvironment(),
        buyerName: buyer.company_name,
        buyerCui: buyer.cui,
        count: imported.total,
        added: imported.added,
        skipped: imported.skipped,
        failed: imported.failed,
        remaining: imported.remaining,
        catalogInserted: 0,
        note: noteParts.join(' '),
        invoices: imported.invoices
      })
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
