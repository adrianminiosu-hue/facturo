import { describe, expect, it } from 'vitest'
import { matchBankTransaction } from '@/lib/bank/matching/engine'
import type { LearnedRule, MatchInvoice } from '@/lib/bank/matching/types'

/**
 * Realistic statement lines (Romanian banks, B2B) against a small ledger.
 * Measures: auto = applied without a click and correct; suggested = correct proposal, one click;
 * wrong = proposes a different invoice (the worst outcome); missed = nothing proposed.
 */
const IBAN = {
  siemens: 'RO49BTRL01301202925689XX',
  vodafone: 'RO09INGB0001008167248910',
  porsche: 'RO37RZBR0000060012345678',
  bogart: 'RO12BRDE450SV12345674500',
  uipath: 'RO66BACX0000001234567890',
  unknown: 'RO55CECE0000000000000001'
}

function inv(id: string, number: string, lei: number, client: string, extra: Partial<MatchInvoice> = {}): MatchInvoice {
  const clients: Record<string, [string, string, string]> = {
    siemens: ['Siemens S.R.L.', 'RO1234567', IBAN.siemens],
    vodafone: ['Vodafone Romania S.A.', 'RO8971726', IBAN.vodafone],
    porsche: ['Porsche Leasing Romania IFN S.A.', 'RO14063826', ''],
    bogart: ["Bog'art Building Management S.R.L.", 'RO23456789', ''],
    uipath: ['UiPath S.R.L.', 'RO34567890', '']
  }
  const [name, cui, iban] = clients[client]
  return {
    id,
    series: 'FCT',
    invoice_number: number,
    client_id: client,
    client_name: name,
    client_cui: cui,
    client_ibans: iban ? [iban] : [],
    issue_date: extra.issue_date || '2026-09-01',
    due_date: '2026-09-30',
    remaining_bani: Math.round(lei * 100),
    currency: 'RON',
    direction: 'issued',
    ...extra
  }
}

const LEDGER: MatchInvoice[] = [
  inv('s30', '0030', 61710, 'siemens', { issue_date: '2026-09-02' }),
  inv('s31', '0031', 25410, 'siemens', { issue_date: '2026-09-05' }),
  inv('s33', '0033', 9869.73, 'siemens', { issue_date: '2026-09-10' }),
  inv('s35', '0035', 157300, 'siemens', { issue_date: '2026-09-12' }),
  inv('v18', '0018', 30250, 'vodafone', { issue_date: '2026-09-01' }),
  inv('v19', '0019', 30250, 'vodafone', { issue_date: '2026-09-03' }),
  inv('v21', '0021', 12100, 'vodafone', { issue_date: '2026-09-08' }),
  inv('p32', '0032', 33408.1, 'porsche', { issue_date: '2026-09-09' }),
  inv('p34', '0034', 2420, 'porsche', { issue_date: '2026-09-11' }),
  inv('b40', '0040', 66550, 'bogart', { issue_date: '2026-09-04' }),
  inv('u41', '0041', 44770, 'uipath', { issue_date: '2026-09-06' }),
  inv('u42', '0042', 5000, 'uipath', { issue_date: '2026-09-07' })
]

const RULES: LearnedRule[] = [{ client_id: 'porsche', counterparty_iban: IBAN.porsche, counterparty_name_norm: null }]

type Case = { name: string; lei: number; payer: string; iban: string; text: string; expect: string[] | null }

const CASES: Case[] = [
  { name: 'ref simplu', lei: 61710, payer: 'SIEMENS SRL', iban: IBAN.siemens, text: 'PLATA FACTURA FCT0030', expect: ['s30'] },
  { name: 'ref cu NR', lei: 25410, payer: 'SIEMENS SRL', iban: IBAN.unknown, text: 'C/V FACTURA NR. 31 DIN 05.09.2026', expect: ['s31'] },
  { name: 'ref FF', lei: 2420, payer: 'PORSCHE LEASING ROMANIA IFN SA', iban: IBAN.unknown, text: 'OP 1254 PLATA FF 34', expect: ['p34'] },
  { name: 'diacritice', lei: 44770, payer: 'UIPATH SRL', iban: IBAN.unknown, text: 'Contravaloare factură nr 41', expect: ['u41'] },
  { name: 'listă numere', lei: 30250 + 30250, payer: 'VODAFONE ROMANIA SA', iban: IBAN.unknown, text: 'PLATA FACTURI FCT18, 19', expect: ['v18', 'v19'] },
  { name: 'listă cu si', lei: 44770 + 5000, payer: 'UIPATH SRL', iban: IBAN.unknown, text: 'fact 41 si 42', expect: ['u41', 'u42'] },
  { name: 'fără ref, IBAN cunoscut', lei: 157300, payer: 'SIEMENS SRL', iban: IBAN.siemens, text: 'TRANSFER', expect: ['s35'] },
  { name: 'fără ref, IBAN învățat', lei: 33408.1, payer: 'PORSCHE LEASING', iban: IBAN.porsche, text: 'PLATA FURNIZOR', expect: ['p32'] },
  { name: 'combinație ne-consecutivă', lei: 61710 + 9869.73, payer: 'SIEMENS SRL', iban: IBAN.siemens, text: 'PLATA', expect: ['s30', 's33'] },
  { name: 'combinație consecutivă', lei: 30250 + 30250 + 12100, payer: 'VODAFONE ROMANIA', iban: IBAN.vodafone, text: 'PLATA SERVICII', expect: ['v18', 'v19', 'v21'] },
  { name: 'nume + sumă, IBAN necunoscut', lei: 66550, payer: "BOG'ART BUILDING MANAGEMENT SRL", iban: IBAN.unknown, text: 'OP 77', expect: ['b40'] },
  { name: 'CUI în detalii', lei: 44770, payer: 'UIPATH', iban: IBAN.unknown, text: 'PLATA CUI 34567890', expect: ['u41'] },
  { name: 'multi-ref parțial', lei: 50000, payer: 'SIEMENS SRL', iban: IBAN.siemens, text: 'AVANS FCT30 FCT31', expect: ['s30'] },
  { name: 'comision bancar reținut', lei: 66530, payer: "BOG'ART BUILDING MANAGEMENT SRL", iban: IBAN.unknown, text: 'PLATA 40', expect: ['b40'] },
  { name: 'abonament: două facturi egale', lei: 30250, payer: 'VODAFONE ROMANIA', iban: IBAN.vodafone, text: 'PLATA', expect: ['v18'] },
  { name: 'ref greșit tastat + IBAN cunoscut', lei: 25410, payer: 'SIEMENS SRL', iban: IBAN.siemens, text: 'FACT FCT 0310', expect: ['s31'] },
  { name: 'nu inventa: contract', lei: 1000, payer: 'CLIENT NOU SRL', iban: IBAN.unknown, text: 'AVANS CONTRACT 12', expect: null },
  { name: 'nu inventa: dobândă', lei: 3.21, payer: 'BANCA TRANSILVANIA', iban: IBAN.unknown, text: 'DOBANDA CREDITOARE', expect: null }
]

function run() {
  const rows = CASES.map(c => {
    const result = matchBankTransaction({
      transaction: { amount_bani: Math.round(c.lei * 100), currency: 'RON', counterparty_name: c.payer, counterparty_iban: c.iban, description: c.text },
      invoices: LEDGER.map(i => ({ ...i })),
      seriesList: ['FCT'],
      defaultSeries: 'FCT',
      rules: RULES
    })
    const got = result ? result.allocations.map(a => a.invoiceId).sort() : null
    const want = c.expect ? [...c.expect].sort() : null
    const correct = JSON.stringify(got) === JSON.stringify(want)
    const outcome = !want ? (got ? 'wrong' : 'ok-none') : !got ? 'missed' : !correct ? 'wrong' : result!.auto ? 'auto' : 'suggested'
    return { name: c.name, outcome, rule: result?.rule, confidence: result?.confidence, got }
  })
  const count = (o: string) => rows.filter(r => r.outcome === o).length
  const payable = CASES.filter(c => c.expect).length
  return { rows, auto: count('auto'), suggested: count('suggested'), wrong: count('wrong'), missed: count('missed'), okNone: count('ok-none'), payable }
}

describe('matching benchmark (realistic statement lines)', () => {
  it('reports the match rates', () => {
    const r = run()
    console.table(r.rows)
    console.log(`auto ${r.auto}/${r.payable} · auto+one-click ${r.auto + r.suggested}/${r.payable} · wrong ${r.wrong} · missed ${r.missed} · correctly left alone ${r.okNone}/${CASES.length - r.payable}`)
    expect(r.wrong).toBe(0)
    expect(r.missed).toBe(0)
    // Floor, so a later change cannot quietly make matching worse.
    expect(r.auto).toBeGreaterThanOrEqual(11)
  })
})
