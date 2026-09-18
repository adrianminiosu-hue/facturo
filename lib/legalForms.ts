/**
 * Nomenclatorul formelor juridice used on ANAF registration declarations
 * (same codes expected in SAF-T / CRC customer master).
 * Source: ANAF — Nomenclatorul formelor juridice (declarații de înregistrare).
 */
export const LEGAL_FORMS = [
  { code: 'SRL', name: 'Societate comercială cu răspundere limitată' },
  { code: 'SA', name: 'Societate comercială pe acțiuni' },
  { code: 'PFA', name: 'Persoană fizică independentă' },
  { code: 'SNC', name: 'Societate comercială în nume colectiv' },
  { code: 'SCS', name: 'Societate comercială în comandită simplă' },
  { code: 'SCA', name: 'Societate comercială în comandită pe acțiuni' },
  { code: 'RA', name: 'Regie autonomă' },
  { code: 'II', name: 'Întreprindere individuală' },
  { code: 'IF', name: 'Întreprindere familială' },
  { code: 'ASF', name: 'Asociație familială' },
  { code: 'CRL', name: 'Societate civilă profesională cu personalitate juridică și răspundere limitată (SPRL)' },
  { code: 'SPI', name: 'Societate profesională a practicienilor în insolvență (SPPI)' },
  { code: 'URL', name: 'Întreprindere profesională unipersonală cu răspundere limitată (IPURL)' },
  { code: 'OC1', name: 'Organizație cooperatistă meșteșugărească' },
  { code: 'OC2', name: 'Organizație cooperatistă de consum' },
  { code: 'OC3', name: 'Organizație cooperatistă de credit' },
  { code: 'CON', name: 'Concesiune' },
  { code: 'INC', name: 'Închiriere' },
  { code: 'LOC', name: 'Locație de gestiune' },
  { code: 'AFJ', name: 'Alte forme juridice' }
] as const

export type LegalFormCode = (typeof LEGAL_FORMS)[number]['code']

const LEGAL_FORM_CODES = new Set<string>(LEGAL_FORMS.map(form => form.code))

export function isLegalFormCode(value?: string | null): value is LegalFormCode {
  return !!value && LEGAL_FORM_CODES.has(value)
}

export const DEFAULT_LEGAL_FORM: LegalFormCode = 'SRL'

function hasFormToken(name: string, code: 'SRL' | 'SA') {
  const dotted = code.split('').join('\\.?')
  return new RegExp(`(?:^|[^A-Z0-9])${dotted}(?:[^A-Z0-9]|$)`).test(name)
}

export function legalFormLabel(code?: string | null) {
  const match = LEGAL_FORMS.find(form => form.code === code)
  return match ? `${match.code} — ${match.name}` : ''
}

/** SRL or SA from the company name; otherwise SRL. */
export function inferLegalForm(name?: string | null): LegalFormCode {
  const upper = String(name || '').toUpperCase()
  if (hasFormToken(upper, 'SRL')) return 'SRL'
  if (hasFormToken(upper, 'SA')) return 'SA'
  return DEFAULT_LEGAL_FORM
}

export function isMissingLegalFormColumnError(error: { message?: string } | null | undefined) {
  const msg = (error?.message || '').toLowerCase()
  return (
    msg.includes('legal_form') &&
    (msg.includes('column') || msg.includes('schema cache') || msg.includes('does not exist'))
  )
}

export function withoutLegalFormColumn<T extends { legal_form?: string }>(row: T): Omit<T, 'legal_form'> {
  const { legal_form: _omit, ...rest } = row
  return rest
}
