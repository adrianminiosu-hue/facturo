export type EmailIssue = 'required' | 'invalid' | 'too_long' | 'typo'

export type EmailValidation = {
  ok: boolean
  normalized: string
  issue?: EmailIssue
  suggestion?: string
}

const MAX_EMAIL = 254
const MAX_LOCAL = 64
const MAX_LABEL = 63

const DOMAIN_TYPOS: Record<string, string> = {
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'googlemail.con': 'gmail.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahooc.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.co': 'outlook.com',
  'icloud.con': 'icloud.com',
  'iclod.com': 'icloud.com',
  'protonmail.con': 'protonmail.com',
  'live.con': 'live.com',
  'msn.con': 'msn.com'
}

const TLD_TYPOS: Record<string, string> = {
  con: 'com',
  cmo: 'com',
  ocm: 'com',
  comm: 'com'
}

export function normalizeEmail(input: string) {
  return input.trim().toLowerCase()
}

function domainSuggestion(domain: string) {
  if (DOMAIN_TYPOS[domain]) return DOMAIN_TYPOS[domain]
  const parts = domain.split('.')
  if (parts.length < 2) return ''
  const tld = parts[parts.length - 1]
  const fixedTld = TLD_TYPOS[tld]
  if (!fixedTld) return ''
  return [...parts.slice(0, -1), fixedTld].join('.')
}

function isValidLocal(local: string) {
  if (!local || local.length > MAX_LOCAL) return false
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  return /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)
}

function isValidDomain(domain: string) {
  if (!domain || domain.length > 253) return false
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false
  if (domain.startsWith('-') || domain.endsWith('-')) return false
  const labels = domain.split('.')
  if (labels.length < 2) return false
  const tld = labels[labels.length - 1]
  if (!/^[a-z]{2,63}$/.test(tld) && !/^xn--[a-z0-9-]{2,59}$/.test(tld)) return false
  return labels.every(label => {
    if (label.length < 1 || label.length > MAX_LABEL) return false
    if (label.startsWith('-') || label.endsWith('-')) return false
    return /^[a-z0-9-]+$/.test(label)
  })
}

export function validateEmail(input: string, opts: { required?: boolean } = {}): EmailValidation {
  const normalized = normalizeEmail(input)
  if (!normalized) {
    return opts.required
      ? { ok: false, normalized, issue: 'required' }
      : { ok: true, normalized }
  }
  if (normalized.length > MAX_EMAIL) {
    return { ok: false, normalized, issue: 'too_long' }
  }
  if (/\s/.test(normalized) || normalized.includes(',') || normalized.includes(';') || normalized.includes('<') || normalized.includes('>')) {
    return { ok: false, normalized, issue: 'invalid' }
  }
  const parts = normalized.split('@')
  if (parts.length !== 2) {
    return { ok: false, normalized, issue: 'invalid' }
  }
  const [local, domain] = parts
  const suggestedDomain = domainSuggestion(domain)
  if (suggestedDomain && suggestedDomain !== domain && isValidLocal(local) && isValidDomain(suggestedDomain)) {
    return {
      ok: false,
      normalized,
      issue: 'typo',
      suggestion: `${local}@${suggestedDomain}`
    }
  }
  if (!isValidLocal(local) || !isValidDomain(domain)) {
    return { ok: false, normalized, issue: 'invalid' }
  }
  return { ok: true, normalized }
}

export function isValidEmail(input: string, opts: { required?: boolean } = {}) {
  return validateEmail(input, opts).ok
}

export function emailIssueKey(issue?: EmailIssue) {
  if (issue === 'required') return 'cli.emailRequired'
  if (issue === 'too_long') return 'cli.emailTooLong'
  if (issue === 'typo') return 'cli.emailTypo'
  return 'cli.emailInvalid'
}
