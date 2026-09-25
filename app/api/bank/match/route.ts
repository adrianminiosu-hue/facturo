import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { confirmMatch, ignoreMatch, undoAllocation, undoMatch } from '@/lib/bank/matching/apply'
import { toBani } from '@/lib/bank/matching/types'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { QueryClient } from '@/lib/bank/tenantWriteServer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const actorUserId = await authenticatedUserId(request)
    if (!actorUserId) return unauthorized()
    const action = String(body.action || '')
    const client = supabaseAdmin() as unknown as QueryClient

    if (action === 'confirm') {
      const allocations = (body.allocations || []).map((row: { invoiceId: string; amount: number }) => ({
        invoiceId: String(row.invoiceId),
        amount_bani: toBani(Number(row.amount))
      }))
      if (!body.transactionId || !allocations.length) {
        return NextResponse.json({ error: 'Selectează cel puțin o factură.' }, { status: 400 })
      }
      const result = await confirmMatch(client, {
        transactionId: String(body.transactionId),
        actorUserId,
        allocations
      })
      return NextResponse.json(result)
    }

    if (action === 'ignore') {
      const result = await ignoreMatch(client, {
        transactionId: String(body.transactionId),
        actorUserId,
        reason: String(body.reason || 'altele')
      })
      return NextResponse.json(result)
    }

    if (action === 'undo') {
      if (body.paymentId && !body.transactionId) {
        const result = await undoAllocation(client, {
          paymentId: String(body.paymentId),
          actorUserId
        })
        return NextResponse.json(result)
      }
      const result = await undoMatch(client, {
        transactionId: String(body.transactionId),
        actorUserId
      })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Acțiune necunoscută.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Operația a eșuat.'
    }, { status: 400 })
  }
}
