import { NextRequest, NextResponse } from 'next/server'
import { bucharestSectorFromText, countyCodeFromName } from '@/lib/romania'

export async function POST(request: NextRequest) {
  try {
    const { cui } = await request.json()
    const cleanCui = cui.replace(/\D/g, '')

    console.log('Looking up CUI:', cleanCui)

    const res = await fetch(`https://api.openapi.ro/api/companies/${cleanCui}`, {
      method: 'GET',
      headers: {
        'x-api-key': process.env.OPENAPI_RO_KEY || '',
        'Content-Type': 'application/json'
      }
    })

    console.log('Status:', res.status)
    const data = await res.json()
    console.log('Response:', JSON.stringify(data))

    if (data && data.denumire) {
      const county = data.judet || ''
      const county_code = countyCodeFromName(county)
      const vatFlag = data.tva ?? data.platitor_tva ?? data.tva_incasare
      return NextResponse.json({
        success: true,
        company_name: data.denumire || '',
        reg_com: data.numar_reg_com || '',
        address: data.adresa || data.strada || '',
        city: county_code === 'B'
          ? bucharestSectorFromText(data.adresa, data.localitate, data.strada, data.sector)
          : (data.localitate || ''),
        county,
        county_code,
        postal_code: data.cod_postal || '',
        country: 'RO',
        vat_registered: vatFlag === undefined || vatFlag === null ? true : Boolean(vatFlag)
      })
    } else {
      return NextResponse.json({ success: false, message: 'CUI negăsit' })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Eroare necunoscută'
    console.log('Error:', message)
    return NextResponse.json({ success: false, message })
  }
}