import { describe, expect, it } from 'vitest'
import { catalogWarnings, dedupeCatalogItems, type CatalogItem } from './catalog'

const item = (id: string, name: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id, name, code: '', kind: 'service', unit_code: 'E48', unit_price: 100, tva_rate: 21,
  vat_category: 'S', vat_exemption_reason: '', discount_percent: 0, active: true, company_id: null, ...extra
})

describe('catalogWarnings', () => {
  it('flags VAT rates no longer in force', () => {
    const w = catalogWarnings([item('a', 'Toner', { tva_rate: 19 }), item('b', 'Consultanță', { tva_rate: 21 }), item('c', 'Carte', { tva_rate: 11 })])
    expect(w.a.oldVat).toBe(true)
    expect(w.b.oldVat).toBe(false)
    expect(w.c.oldVat).toBe(false)
  })

  it('spots names that differ only by case, diacritics or singular/plural', () => {
    const w = catalogWarnings([
      item('1', 'servicii mentenanta'),
      item('2', 'SERVICIU MENTENANȚĂ'),
      item('3', 'Servicii mentenanta Site'),
      item('4', 'Servicii Consultanta IT')
    ])
    expect(w['1'].duplicateOf).toBeNull()
    expect(w['2'].duplicateOf).toBe('servicii mentenanta')
    expect(w['3'].duplicateOf).toBeNull()
    expect(w['4'].duplicateOf).toBeNull()
  })

  it('ignores inactive articles', () => {
    const w = catalogWarnings([item('1', 'Toner', { tva_rate: 19, active: false }), item('2', 'toner', { active: false })])
    expect(w['1'].oldVat).toBe(false)
    expect(w['2'].duplicateOf).toBeNull()
  })
})

describe('dedupeCatalogItems', () => {
  it("prefers the firm's own article over a common one with the same name", () => {
    const list = dedupeCatalogItems([item('common', 'Consultanță'), item('firm', 'consultanță', { company_id: 'f1', unit_price: 200 })])
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('firm')
  })
})
