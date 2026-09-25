import { NextRequest, NextResponse } from 'next/server'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { importStatement } from '@/lib/bank/import/importStatement'
import type { CsvImportMapping } from '@/lib/bank/import/types'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { QueryClient } from '@/lib/bank/tenantWriteServer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const file = form.get('file')
    // Acting user from the session; company access is verified inside importStatement.
    const actorUserId = await authenticatedUserId(request)
    if (!actorUserId) return unauthorized()
    const userId = String(form.get('userId') || actorUserId)
    const companyId = String(form.get('companyId') || '')
    const confirmForeignIban = form.get('confirmForeignIban') === 'true'
    const statementIbanOverride = String(form.get('statementIban') || '')
    const mappingRaw = String(form.get('csvMapping') || '')
    if (!actorUserId || !companyId) {
      return NextResponse.json({ error: 'Lipsesc userId sau companyId.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Încarcă un extras.' }, { status: 400 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    let csvMapping: CsvImportMapping | null = null
    if (mappingRaw) {
      csvMapping = JSON.parse(mappingRaw) as CsvImportMapping
    }
    const result = await importStatement(supabaseAdmin() as unknown as QueryClient, {
      actorUserId,
      userId,
      companyId,
      fileName: file.name,
      bytes,
      csvMapping,
      confirmForeignIban,
      statementIbanOverride: statementIbanOverride || null
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Importul a eșuat.'
    }, { status: 400 })
  }
}
