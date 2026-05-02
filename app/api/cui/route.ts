import { NextRequest, NextResponse } from 'next/server'

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
      return NextResponse.json({
        success: true,
        company_name: data.denumire || '',
        reg_com: data.numar_reg_com || '',
        address: data.adresa || '',
        city: data.localitate || '',
        county: data.judet || ''
      })
    } else {
      return NextResponse.json({ success: false, message: 'CUI negăsit' })
    }
  } catch (e: any) {
    console.log('Error:', e.message)
    return NextResponse.json({ success: false, message: e.message })
  }
}