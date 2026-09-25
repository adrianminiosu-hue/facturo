import { NextRequest, NextResponse } from 'next/server'
import { bucharestSectorFromText, countyCodeFromName } from '@/lib/romania'
import { inferLegalForm } from '@/lib/legalForms'
import { pickRegCom } from '@/lib/regCom'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { cleanCui, fetchAnafCompanies } from '@/lib/anafCompany'
import { calendarDateInBucharest } from '@/lib/dates'

/** ANAF registry first (free, official); openapi.ro only when ANAF is unreachable. */
async function fromAnaf(cui: string) {
  const found = await fetchAnafCompanies([cui], calendarDateInBucharest(0))
  const company = found.get(cui)
  if (!company) return { success: false, message: 'CUI negăsit', source: 'anaf' }
  return {
    success: true,
    source: 'anaf',
    company_name: company.company_name,
    reg_com: company.reg_com,
    address: company.address,
    city: company.city,
    county: company.county,
    county_code: company.county_code,
    postal_code: company.postal_code,
    country: 'RO',
    vat_registered: company.vat_registered,
    legal_form: inferLegalForm(company.company_name),
    anaf: {
      inactive: company.inactive,
      deregistered_on: company.deregistered_on,
      efactura_registered: company.efactura_registered,
      vat_on_collection: company.vat_on_collection,
      split_vat: company.split_vat,
      registration_status: company.registration_status
    }
  }
}

async function fromOpenApi(cui: string) {
  if (!process.env.OPENAPI_RO_KEY) return { success: false, message: 'Serviciul ANAF nu răspunde. Încearcă din nou.' }
  const res = await fetch(`https://api.openapi.ro/api/companies/${cui}`, {
    method: 'GET',
    headers: { 'x-api-key': process.env.OPENAPI_RO_KEY, 'Content-Type': 'application/json' }
  })
  const data = await res.json()
  if (!data?.denumire) return { success: false, message: 'CUI negăsit', source: 'openapi' }
  const county = data.judet || ''
  const county_code = countyCodeFromName(county)
  const vatFlag = data.tva ?? data.platitor_tva ?? data.tva_incasare
  return {
    success: true,
    source: 'openapi',
    company_name: data.denumire || '',
    reg_com: pickRegCom([data.numar_reg_com, data.cod_inmatriculare, data.euid, data.nr_reg_com, data.nrRegCom], { county, countyCode: county_code }),
    address: data.adresa || data.strada || '',
    city: county_code === 'B'
      ? bucharestSectorFromText(data.adresa, data.localitate, data.strada, data.sector)
      : (data.localitate || ''),
    county,
    county_code,
    postal_code: data.cod_postal || '',
    country: 'RO',
    vat_registered: vatFlag === undefined || vatFlag === null ? true : Boolean(vatFlag),
    legal_form: inferLegalForm(data.denumire)
  }
}

export async function POST(request: NextRequest) {
  // Authenticated only: the lookup is rate-limited upstream and the fallback is a paid API.
  const userId = await authenticatedUserId(request)
  if (!userId) return unauthorized()
  try {
    const { cui } = await request.json()
    const clean = cleanCui(cui)
    if (clean.length < 2 || clean.length > 10) {
      return NextResponse.json({ success: false, message: 'CUI invalid' })
    }
    try {
      return NextResponse.json(await fromAnaf(clean))
    } catch (anafError) {
      console.warn('ANAF lookup failed, falling back to openapi.ro:', anafError instanceof Error ? anafError.message : anafError)
      return NextResponse.json(await fromOpenApi(clean))
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Eroare necunoscută'
    return NextResponse.json({ success: false, message })
  }
}
