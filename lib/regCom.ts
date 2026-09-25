import { onrcCountyNumber } from '@/lib/romania'

const ONRC_PREFIX = /^ROONRC\.?/i
const CLASSIC_REG_COM = /^([A-Z])(\d{1,2})(\d+)((?:19|20)\d{2})$/
const NEW_ONRC_ID = /^([A-Z])((?:19|20)\d{2})(\d{7})(\d{2})$/

export type RegComHint = {
  county?: string | null
  countyCode?: string | null
}

/** Official Nr. Reg. Comerț uses / — APIs now send J2002000372404. */
export function formatRegCom(raw?: string | null, hint?: RegComHint): string {
  const value = String(raw ?? '').trim().replace(ONRC_PREFIX, '')
  if (!value) return ''

  const unified = value
    .replace(/[\\|;._\-\u2215]+/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toUpperCase()

  if (unified.includes('/')) return unified

  const compact = unified.replace(/[^A-Z0-9]/g, '')
  if (!compact) return ''

  const modern = compact.match(NEW_ONRC_ID)
  if (modern) {
    const [, letter, year, serial] = modern
    const county = onrcCountyNumber(hint?.county, hint?.countyCode)
    if (county) {
      const number = serial.replace(/^0+/, '') || '0'
      return `${letter}${county}/${number}/${year}`
    }
  }

  const classic = compact.match(CLASSIC_REG_COM)
  if (classic) {
    const [, letter, county, number, year] = classic
    return `${letter}${county}/${number}/${year}`
  }

  return unified
}

export function pickRegCom(candidates: unknown[], hint?: RegComHint): string {
  const formatted = candidates
    .map(candidate => formatRegCom(candidate == null ? '' : String(candidate), hint))
    .filter(Boolean)
  return formatted.find(value => value.includes('/')) || formatted[0] || ''
}
