import { bucharestSectorFromText, countyCodeFromName } from '@/lib/romania'
import { pickRegCom } from '@/lib/regCom'

/** ANAF public taxpayer registry (no auth). Docs: static.anaf.ro/.../doc_WS_V9.txt */
export const ANAF_TVA_URL = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva'
/** ANAF limits: max 100 CUIs per request, max 1 request per second. */
export const ANAF_BATCH_SIZE = 100
export const ANAF_MIN_INTERVAL_MS = 1100
const ANAF_TIMEOUT_MS = 8000

export type AnafCompany = {
  cui: string
  company_name: string
  reg_com: string
  address: string
  city: string
  county: string
  county_code: string
  postal_code: string
  phone: string
  caen: string
  registration_status: string
  vat_registered: boolean
  vat_on_collection: boolean
  split_vat: boolean
  inactive: boolean
  /** YYYY-MM-DD when the company was struck off (radiată), else null. */
  deregistered_on: string | null
  efactura_registered: boolean
}

export function cleanCui(value: unknown): string {
  return String(value ?? '').replace(/^RO/i, '').replace(/\D/g, '')
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim())
const bool = (v: unknown) => v === true || v === 'true' || v === 'DA'
const isoDate = (v: unknown) => {
  const s = str(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** "Mun. Cluj-Napoca" → "Cluj-Napoca"; Bucharest → "Sector N". */
export function anafCity(locality: string, countyCode: string, ...context: string[]) {
  if (countyCode === 'B') {
    const sector = bucharestSectorFromText(locality, ...context)
    if (sector) return sector
  }
  return locality
    .replace(/^(municipiul|mun\.|oraș(ul)?|oraş(ul)?|oras(ul)?|orș\.|orş\.|ors\.|comuna|com\.|sat(ul)?|sat\.)\s+/i, '')
    .trim()
}

function joinAddress(parts: Array<string | undefined>) {
  return parts.map(p => str(p)).filter(Boolean).join(', ')
}

// ANAF payloads are loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAnafRecord(record: any): AnafCompany | null {
  const general = record?.date_generale
  if (!general?.cui) return null
  const seat = record.adresa_sediu_social || {}
  const fiscal = record.adresa_domiciliu_fiscal || {}
  const useSeat = !!str(seat.sdenumire_Localitate)

  const countyName = useSeat ? str(seat.sdenumire_Judet) : str(fiscal.ddenumire_Judet)
  const autoCode = (useSeat ? str(seat.scod_JudetAuto) : str(fiscal.dcod_JudetAuto)).toUpperCase()
  const county_code = countyCodeFromName(countyName) || autoCode
  const locality = useSeat ? str(seat.sdenumire_Localitate) : str(fiscal.ddenumire_Localitate)
  const streetLine = useSeat
    ? joinAddress([
        [str(seat.sdenumire_Strada), str(seat.snumar_Strada) && `Nr. ${str(seat.snumar_Strada)}`].filter(Boolean).join(' '),
        seat.sdetalii_Adresa
      ])
    : joinAddress([
        [str(fiscal.ddenumire_Strada), str(fiscal.dnumar_Strada) && `Nr. ${str(fiscal.dnumar_Strada)}`].filter(Boolean).join(' '),
        fiscal.ddetalii_Adresa
      ])
  const address = streetLine || str(general.adresa)
  const inactiveInfo = record.stare_inactiv || {}
  const registration = str(general.stare_inregistrare)
  const deregistered_on = isoDate(inactiveInfo.dataRadiere) || (/RADIERE|RADIAT/i.test(registration) ? isoDate(general.data) : null)

  return {
    cui: cleanCui(general.cui),
    company_name: str(general.denumire),
    reg_com: pickRegCom([general.nrRegCom], { county: countyName, countyCode: county_code }),
    address,
    city: anafCity(locality, county_code, str(general.adresa)),
    county: countyName,
    county_code,
    postal_code: str(useSeat ? seat.scod_Postal : fiscal.dcod_Postal) || str(general.codPostal),
    phone: str(general.telefon),
    caen: str(general.cod_CAEN),
    registration_status: registration,
    vat_registered: bool(record.inregistrare_scop_Tva?.scpTVA),
    vat_on_collection: bool(record.inregistrare_RTVAI?.statusTvaIncasare),
    split_vat: bool(record.inregistrare_SplitTVA?.statusSplitTVA),
    inactive: bool(inactiveInfo.statusInactivi),
    deregistered_on,
    efactura_registered: bool(general.statusRO_e_Factura)
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Looks up CUIs in the ANAF registry. Throws when ANAF is unreachable or answers with an error,
 * so callers can fall back to another source. CUIs ANAF does not know are simply absent from the map.
 */
export async function fetchAnafCompanies(cuis: string[], date: string, fetchImpl: typeof fetch = fetch): Promise<Map<string, AnafCompany>> {
  const unique = [...new Set(cuis.map(cleanCui).filter(Boolean))]
  const result = new Map<string, AnafCompany>()
  for (let i = 0; i < unique.length; i += ANAF_BATCH_SIZE) {
    if (i > 0) await sleep(ANAF_MIN_INTERVAL_MS)
    const batch = unique.slice(i, i + ANAF_BATCH_SIZE)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ANAF_TIMEOUT_MS)
    try {
      const res = await fetchImpl(ANAF_TVA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map(cui => ({ cui: Number(cui), data: date }))),
        signal: controller.signal,
        cache: 'no-store'
      })
      if (!res.ok) throw new Error(`ANAF HTTP ${res.status}`)
      const body = await res.json()
      if (body?.cod && Number(body.cod) !== 200) throw new Error(`ANAF ${body.cod}: ${body.message || ''}`)
      for (const record of body?.found || []) {
        const parsed = parseAnafRecord(record)
        if (parsed) result.set(parsed.cui, parsed)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  return result
}

/** Status columns stored on `clients` (migration 20260926_client_anaf_status.sql). */
export function anafStatusColumns(company: AnafCompany | null, checkedAt: string) {
  if (!company) return { anaf_checked_at: checkedAt }
  return {
    anaf_checked_at: checkedAt,
    anaf_inactive: company.inactive,
    anaf_deregistered_on: company.deregistered_on,
    anaf_efactura_registered: company.efactura_registered,
    anaf_vat_on_collection: company.vat_on_collection,
    anaf_split_vat: company.split_vat,
    vat_registered: company.vat_registered
  }
}
