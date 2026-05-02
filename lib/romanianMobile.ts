export type RomanianMobileValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; normalized: string }

function stripPhoneFormatting(input: string) {
  // keep leading "+" if present; strip everything else non-digit
  const trimmed = input.trim()
  if (!trimmed) return ''
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

export function normalizeRomanianMobile(input: string) {
  const compact = stripPhoneFormatting(input)
  if (!compact) return ''

  // Convert 0040xxxxxxxxx -> +40xxxxxxxxx
  if (compact.startsWith('0040')) return `+${compact.slice(2)}`

  // Keep +40 if already present
  if (compact.startsWith('+40')) return compact

  // Keep local 07xxxxxxxx as-is
  if (/^07\d{8}$/.test(compact)) return compact

  // If user typed 40xxxxxxxxx without +, normalize to +40...
  if (/^40\d+$/.test(compact)) return `+${compact}`

  return compact
}

export function validateRomanianMobile(input: string): RomanianMobileValidationResult {
  const normalized = normalizeRomanianMobile(input)
  const digits = normalized.replace(/\D/g, '')

  // Romanian mobile: 07xxxxxxxx (10 digits) OR +407xxxxxxxx (11 digits with country code 40)
  const ok = /^07\d{8}$/.test(digits) || /^407\d{8}$/.test(digits)
  return ok ? { ok: true, normalized } : { ok: false, normalized }
}

export function isValidRomanianMobile(input: string) {
  return validateRomanianMobile(input).ok
}
