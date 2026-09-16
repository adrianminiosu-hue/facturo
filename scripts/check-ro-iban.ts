/**
 * Focused Romanian IBAN + SWIFT checks (ISO 13616-1 / ISO 9362 / SWIFT IBAN Registry RO).
 * Run: npx tsx scripts/check-ro-iban.ts
 */
import {
  RO_IBAN_REGISTRY_EXAMPLE,
  buildRoIban,
  validateClientBankDetails,
  validateRoIban,
  validateSwift
} from '../lib/roBanks'

type Case = { name: string; ok: boolean; run: () => { ok: boolean; error: string | null } }

const rncbIban = buildRoIban('RNCB', '0000000000000001')

const cases: Case[] = [
  {
    name: 'SWIFT registry example RO49AAAA… passes MOD-97 for Banca Transilvania',
    ok: true,
    run: () => validateClientBankDetails({
      bankName: 'Banca Transilvania',
      iban: RO_IBAN_REGISTRY_EXAMPLE,
      bic: 'BTRLRO22'
    })
  },
  {
    name: 'RNCB example with valid MOD-97 passes for BCR + RNCBROBU',
    ok: true,
    run: () => validateClientBankDetails({
      bankName: 'BCR',
      iban: rncbIban,
      bic: 'RNCBROBU'
    })
  },
  {
    name: '11-char SWIFT branch suffix XXX is accepted',
    ok: true,
    run: () => validateClientBankDetails({
      bankName: 'BCR',
      iban: rncbIban,
      bic: 'RNCBROBUXXX'
    })
  },
  {
    name: 'Wrong length fails',
    ok: false,
    run: () => validateRoIban('RO49RNCB00000000000000')
  },
  {
    name: 'Wrong check digits fail',
    ok: false,
    run: () => validateRoIban('RO00RNCB0000000000000001')
  },
  {
    name: 'Wrong bank vs IBAN code fails',
    ok: false,
    run: () => validateClientBankDetails({
      bankName: 'Banca Transilvania',
      iban: rncbIban,
      bic: 'BTRLRO22'
    })
  },
  {
    name: 'Wrong SWIFT fails',
    ok: false,
    run: () => validateClientBankDetails({
      bankName: 'BCR',
      iban: rncbIban,
      bic: 'BTRLRO22'
    })
  },
  {
    name: 'Form field bank_name is accepted (same as bankName)',
    ok: true,
    run: () => validateClientBankDetails({
      bank_name: 'BCR',
      iban: rncbIban,
      bic: 'RNCBROBU'
    })
  },
  {
    name: 'Empty IBAN is ok',
    ok: true,
    run: () => validateClientBankDetails({ bankName: '', iban: '', bic: '' })
  },
  {
    name: 'Filled IBAN without bank fails',
    ok: false,
    run: () => validateClientBankDetails({ bankName: '', iban: rncbIban, bic: 'RNCBROBU' })
  },
  {
    name: 'validateSwift rejects mismatched BIC',
    ok: false,
    run: () => validateSwift('BACXROBU', 'BCR')
  }
]

let failed = 0
for (const test of cases) {
  const result = test.run()
  const passed = result.ok === test.ok
  if (!passed) {
    failed += 1
    console.error(`FAIL  ${test.name}`)
    console.error(`      expected ok=${test.ok}, got ok=${result.ok} error=${result.error || '—'}`)
  } else {
    console.log(`PASS  ${test.name}${result.error ? ` (${result.error})` : ''}`)
  }
}

console.log(`\nRNCB sample IBAN: ${rncbIban}`)
if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll IBAN/SWIFT checks passed.')
