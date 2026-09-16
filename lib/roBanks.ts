/**
 * Romanian IBAN + SWIFT/BIC validation for Facturo client/profile forms.
 *
 * Official material (ISO / SWIFT / BNR):
 * - SWIFT IBAN Registry: https://www.swift.com/standards/data-standards/iban
 *   Romania (RO) electronic format: RO2!n4!a16!c — 24 characters:
 *   country RO + 2 numeric check digits + 4-letter bank identifier + 16-character BBAN/account.
 * - ISO 13616-1: Financial services — International bank account number (IBAN).
 *   Check: rearrange BBAN + country + check digits, A=10…Z=35, interpret as integer, remainder MOD 97 must be 1.
 * - ISO 9362: BIC (SWIFT) — 8 or 11 alphanumeric characters:
 *   4 bank + 2 country + 2 location [+ 3 branch]. Romanian credit institutions typically use XXXXRO..
 * - BNR — List of credit institutions in Romania (bănci). Bank codes below match IBAN positions 5–8
 *   as published in the SWIFT IBAN Registry / bank documentation (BTRL, BACX, RZBR, RNCB, BRDE, …).
 *
 * Example from the SWIFT IBAN Registry (dummy bank code AAAA): RO49AAAA1B31007593840000
 */
import { normalizeIban } from './iban'

export type RoBank = {
  name: string
  /** IBAN bank identifier(s) at positions 5–8 (ISO 13616 / SWIFT IBAN Registry). */
  ibanCodes: string[]
  /** Primary 8-character BIC (ISO 9362). 11-character form with branch suffix is also accepted. */
  bic: string
  bicAliases?: string[]
}

/**
 * Directory of banks offered in the client/profile form.
 * IBAN codes: SWIFT IBAN Registry RO national identifier (4!a).
 * BIC values: ISO 9362 codes commonly published by each institution (RO location).
 */
export const RO_BANKS: readonly RoBank[] = [
  {
    name: 'Banca Transilvania',
    // AAAA is the dummy identifier in the SWIFT IBAN Registry example, not a live BT code.
    ibanCodes: ['BTRL', 'AAAA'],
    bic: 'BTRLRO22'
  },
  { name: 'UniCredit Bank', ibanCodes: ['BACX'], bic: 'BACXROBU' },
  { name: 'Raiffeisen Bank', ibanCodes: ['RZBR'], bic: 'RZBRROBU' },
  { name: 'BCR', ibanCodes: ['RNCB'], bic: 'RNCBROBU' },
  { name: 'BRD', ibanCodes: ['BRDE'], bic: 'BRDEROBU' },
  { name: 'ING Bank', ibanCodes: ['INGB'], bic: 'INGBROBU' },
  { name: 'Alpha Bank', ibanCodes: ['BUCU'], bic: 'BUCUROBU' },
  { name: 'CEC Bank', ibanCodes: ['CECE'], bic: 'CECEROBU' },
  { name: 'OTP Bank', ibanCodes: ['OTPV'], bic: 'OTPVROBU' },
  { name: 'Garanti BBVA', ibanCodes: ['UGBI'], bic: 'UGBIROBU' }
] as const

export const ROMANIAN_BANK_NAMES = RO_BANKS.map(bank => bank.name)

/** Official SWIFT IBAN Registry example for Romania (passes ISO 13616 MOD-97). */
export const RO_IBAN_REGISTRY_EXAMPLE = 'RO49AAAA1B31007593840000'

export const RO_IBAN_PLACEHOLDER = RO_IBAN_REGISTRY_EXAMPLE
export const RO_IBAN_LENGTH = 24

const IBAN_CHARSET_RE = /^[A-Z0-9]*$/
const BIC_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/

export type ParsedRoIban = {
  compact: string
  country: string
  checkDigits: string
  bankCode: string
  account: string
}

export type ValidationResult = {
  ok: boolean
  error: string | null
  bankCode: string
  bankName: string
  expectedBic: string
}

export type FieldHint = {
  tone: 'none' | 'error' | 'warn' | 'ok'
  message: string
}

export function normalizeBic(value?: string | null) {
  return String(value || '').replace(/[\s-]/g, '').toUpperCase()
}

export function findBankByName(name?: string | null) {
  const needle = String(name || '').trim()
  if (!needle) return undefined
  return RO_BANKS.find(bank => bank.name === needle)
}

export function findBankByIbanCode(code?: string | null) {
  const needle = String(code || '').trim().toUpperCase()
  if (!needle) return undefined
  return RO_BANKS.find(bank => bank.ibanCodes.includes(needle))
}

export function expectedBicForBank(name?: string | null) {
  return findBankByName(name)?.bic || ''
}

export function parseRoIban(iban?: string | null): ParsedRoIban | null {
  const compact = normalizeIban(iban)
  if (compact.length !== RO_IBAN_LENGTH) return null
  return {
    compact,
    country: compact.slice(0, 2),
    checkDigits: compact.slice(2, 4),
    bankCode: compact.slice(4, 8),
    account: compact.slice(8)
  }
}

function ibanToNumeric(value: string) {
  let numeric = ''
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') numeric += ch
    else numeric += String(ch.charCodeAt(0) - 55) // A=10 … Z=35
  }
  return numeric
}

/** ISO 13616-1 MOD-97 over a decimal string, computed iteratively (IBAN digits exceed Number precision). */
export function mod97(numeric: string) {
  let remainder = 0
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + (numeric.charCodeAt(i) - 48)) % 97
  }
  return remainder
}

export function ibanMod97Valid(iban?: string | null) {
  const compact = normalizeIban(iban)
  if (compact.length < 5) return false
  const rearranged = compact.slice(4) + compact.slice(0, 4)
  return mod97(ibanToNumeric(rearranged)) === 1
}

/** Build a RO IBAN with valid ISO 13616 check digits for tests and examples. */
export function buildRoIban(bankCode: string, account: string) {
  const code = bankCode.toUpperCase().padEnd(4, 'X').slice(0, 4)
  const bban = (account.toUpperCase() + '0000000000000000').slice(0, 16)
  const withZeroCheck = `RO00${code}${bban}`
  const rearranged = withZeroCheck.slice(4) + 'RO00'
  const check = 98 - mod97(ibanToNumeric(rearranged))
  return `RO${String(check).padStart(2, '0')}${code}${bban}`
}

function emptyValidation(error: string | null = null, extra: Partial<ValidationResult> = {}): ValidationResult {
  return {
    bankCode: '',
    bankName: '',
    expectedBic: '',
    ...extra,
    ok: !error,
    error
  }
}

export function validateRoIban(iban?: string | null): ValidationResult {
  const compact = normalizeIban(iban)
  if (!compact) return emptyValidation()

  if (!IBAN_CHARSET_RE.test(compact)) {
    return emptyValidation('IBAN-ul poate conține doar litere și cifre (A–Z, 0–9).')
  }
  if (!compact.startsWith('RO')) {
    return emptyValidation('IBAN-ul trebuie să înceapă cu RO.')
  }
  if (compact.length !== RO_IBAN_LENGTH) {
    return emptyValidation(
      'IBAN-ul românesc trebuie să aibă exact 24 de caractere (RO + 2 cifre de control + 4 litere bancă + 16 caractere cont).'
    )
  }
  if (!/^[0-9]{2}$/.test(compact.slice(2, 4))) {
    return emptyValidation('Cifrele de control IBAN (pozițiile 3–4) trebuie să fie numerice.')
  }
  if (!/^[A-Z]{4}$/.test(compact.slice(4, 8))) {
    return emptyValidation('Codul bancar din IBAN trebuie să aibă 4 litere (pozițiile 5–8).')
  }
  if (!ibanMod97Valid(compact)) {
    return emptyValidation('Cifrele de control IBAN sunt invalide (verificare ISO 13616 MOD-97).')
  }

  const parsed = parseRoIban(compact)!
  const bank = findBankByIbanCode(parsed.bankCode)
  if (!bank) {
    return emptyValidation(
      `Cod bancar necunoscut în IBAN (${parsed.bankCode}). Alege o bancă din listă sau verifică IBAN-ul.`,
      { bankCode: parsed.bankCode }
    )
  }

  return {
    ok: true,
    error: null,
    bankCode: parsed.bankCode,
    bankName: bank.name,
    expectedBic: bank.bic
  }
}

export function bicPrefix(bic?: string | null) {
  const compact = normalizeBic(bic)
  return compact.slice(0, 8)
}

function bankAcceptsBic(bank: RoBank, bic?: string | null) {
  const compact = normalizeBic(bic)
  if (!compact) return false
  const prefix = compact.slice(0, 8)
  const accepted = [bank.bic, ...(bank.bicAliases || [])]
  return accepted.some(code => prefix === code.slice(0, 8))
}

export function validateSwift(bic?: string | null, bankName?: string | null): ValidationResult {
  const compact = normalizeBic(bic)
  const bank = findBankByName(bankName)
  const extra = {
    bankName: bank?.name || '',
    expectedBic: bank?.bic || ''
  }

  if (!compact) {
    if (bank) return emptyValidation('Completează SWIFT/BIC. Se completează automat din banca selectată.', extra)
    return emptyValidation(null, extra)
  }
  if (!BIC_RE.test(compact)) {
    return emptyValidation(
      'SWIFT/BIC invalid. Format ISO 9362: 8 sau 11 caractere alfanumerice (ex: RNCBROBU sau RNCBROBUXXX).',
      extra
    )
  }
  if (bank && !bankAcceptsBic(bank, compact)) {
    return emptyValidation(
      `SWIFT/BIC-ul nu corespunde băncii selectate (${bank.name}). Valoare așteptată: ${bank.bic} (sau ${bank.bic}XXX).`,
      extra
    )
  }

  return { ok: true, error: null, bankCode: '', ...extra }
}

export function validateClientBankDetails(input: {
  bankName?: string | null
  bank_name?: string | null
  iban?: string | null
  bic?: string | null
}): ValidationResult {
  const bankName = String(input.bankName || input.bank_name || '').trim()
  const iban = normalizeIban(input.iban)
  const bic = normalizeBic(input.bic)
  const bank = findBankByName(bankName)

  if (!iban) {
    if (!bic) return emptyValidation(null, { bankName, expectedBic: bank?.bic || '' })
    return validateSwift(bic, bankName)
  }

  if (!bankName) {
    const ibanResult = validateRoIban(iban)
    return emptyValidation(
      'Selectează banca emitentă. Este obligatorie când completezi IBAN-ul.',
      {
        bankCode: ibanResult.bankCode,
        bankName: ibanResult.bankName,
        expectedBic: ibanResult.expectedBic
      }
    )
  }

  const ibanResult = validateRoIban(iban)
  if (!ibanResult.ok) return { ...ibanResult, bankName: bank?.name || ibanResult.bankName }

  if (ibanResult.bankName !== bankName) {
    return emptyValidation(
      `Codul bancar din IBAN (${ibanResult.bankCode}) nu corespunde băncii selectate (${bankName}). Pentru ${ibanResult.bankName}, IBAN-ul conține ${ibanResult.bankCode}.`,
      ibanResult
    )
  }

  if (!bic) {
    return emptyValidation(
      'Completează SWIFT/BIC. Se completează automat din banca selectată.',
      ibanResult
    )
  }

  const swiftResult = validateSwift(bic, bankName)
  if (!swiftResult.ok) {
    return { ...swiftResult, bankCode: ibanResult.bankCode, expectedBic: ibanResult.expectedBic }
  }

  return {
    ok: true,
    error: null,
    bankCode: ibanResult.bankCode,
    bankName: ibanResult.bankName,
    expectedBic: ibanResult.expectedBic
  }
}

export function ibanLiveHint(iban: string, bankName: string): FieldHint {
  const compact = normalizeIban(iban)
  if (!compact) return { tone: 'none', message: '' }

  if (!IBAN_CHARSET_RE.test(compact)) {
    return { tone: 'error', message: 'IBAN-ul poate conține doar litere și cifre (A–Z, 0–9).' }
  }
  if (!compact.startsWith('RO')) {
    return { tone: 'error', message: 'IBAN-ul trebuie să înceapă cu RO.' }
  }
  if (compact.length < RO_IBAN_LENGTH) {
    return { tone: 'warn', message: `${RO_IBAN_LENGTH - compact.length} caractere rămase` }
  }

  const ibanOnly = validateRoIban(compact)
  if (!ibanOnly.ok) return { tone: 'error', message: ibanOnly.error || 'IBAN invalid.' }

  if (bankName && ibanOnly.bankName !== bankName) {
    return {
      tone: 'error',
      message: `Codul bancar din IBAN (${ibanOnly.bankCode}) nu corespunde băncii selectate (${bankName}). Pentru ${ibanOnly.bankName}, IBAN-ul conține ${ibanOnly.bankCode}.`
    }
  }

  return {
    tone: 'ok',
    message: `✓ IBAN valid · ${ibanOnly.bankName} (${ibanOnly.bankCode})`
  }
}

export function bicLiveHint(bic: string, bankName: string, iban: string): FieldHint {
  const compact = normalizeBic(bic)
  const ibanCompact = normalizeIban(iban)

  if (!compact) {
    if (ibanCompact) {
      return { tone: 'error', message: 'Completează SWIFT/BIC. Se completează automat din banca selectată.' }
    }
    return { tone: 'none', message: '' }
  }

  const result = validateSwift(compact, bankName)
  if (!result.ok) return { tone: 'error', message: result.error || 'SWIFT/BIC invalid.' }
  if (bankName) {
    return { tone: 'ok', message: `✓ SWIFT valid · ${bicPrefix(compact)}` }
  }
  return { tone: 'none', message: '' }
}

export function applyBankSelection(
  nextBankName: string,
  current: { bank_name: string; iban: string; bic: string }
) {
  const nextBank = findBankByName(nextBankName)
  const previousBank = findBankByName(current.bank_name)
  const currentBic = normalizeBic(current.bic)
  const wasAuto = !currentBic || (previousBank ? bankAcceptsBic(previousBank, currentBic) : false)
  return {
    bank_name: nextBankName,
    iban: current.iban,
    bic: nextBank && wasAuto ? nextBank.bic : currentBic
  }
}

export function applyIbanInput(
  rawIban: string,
  current: { bank_name: string; iban: string; bic: string }
) {
  const iban = normalizeIban(rawIban).slice(0, RO_IBAN_LENGTH)
  let bank_name = current.bank_name
  let bic = normalizeBic(current.bic)

  if (!bank_name && iban.length >= 8) {
    const bank = findBankByIbanCode(iban.slice(4, 8))
    if (bank) {
      bank_name = bank.name
      if (!bic) bic = bank.bic
    }
  }

  return { bank_name, iban, bic }
}

export function applyBicInput(
  rawBic: string,
  current: { bank_name: string; iban: string; bic: string }
) {
  return {
    ...current,
    bic: normalizeBic(rawBic).slice(0, 11)
  }
}

export function withoutBicColumn<T extends { bic?: string }>(row: T): Omit<T, 'bic'> {
  const { bic, ...rest } = row
  void bic
  return rest
}

export function isMissingBicColumnError(error: { message?: string; code?: string } | null | undefined) {
  const msg = (error?.message || '').toLowerCase()
  return (
    msg.includes('bic') &&
    (msg.includes('column') || msg.includes('schema cache') || msg.includes('does not exist'))
  )
}
