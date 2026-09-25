import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anafTimestamp, parseMessageList, purchaseAmounts } from './spvPurchaseImport'
import { parseUblInvoice } from './ublInvoice'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

describe('SPV message list', () => {
  it('reads received-invoice messages', () => {
    const r = parseMessageList({
      mesaje: [{ data_creare: '202609251140', cif: '12312343', id_solicitare: '5001234567', detalii: 'Factura cu id_incarcare=5001234567 emisa de cif_emitent=14399840 pentru cif_beneficiar=12312343', tip: 'FACTURA PRIMITA', id: '3001234567' }],
      numar_total_pagini: 1,
      serial: '1234AA456',
      cui: '12312343',
      titlu: 'Lista Mesaje disponibile din ultimele 60 zile'
    })
    expect(r.error).toBeUndefined()
    expect(r.messages).toEqual([{
      id: '3001234567',
      idSolicitare: '5001234567',
      type: 'FACTURA PRIMITA',
      cif: '12312343',
      details: 'Factura cu id_incarcare=5001234567 emisa de cif_emitent=14399840 pentru cif_beneficiar=12312343',
      createdAt: '2026-09-25T11:40:00+03:00'
    }])
  })

  it('treats "no messages" as an empty inbox and other answers as errors', () => {
    expect(parseMessageList({ eroare: 'Nu exista mesaje in ultimele 60 zile', titlu: 'Lista Mesaje' })).toEqual({ messages: [], totalPages: 0 })
    expect(parseMessageList({ eroare: 'Nu aveti drept in SPV pentru CIF=123' }).error).toContain('Nu aveti drept')
  })

  it('converts ANAF timestamps', () => {
    expect(anafTimestamp('202601050905')).toBe('2026-01-05T09:05:00+03:00')
  })
})

describe('purchaseAmounts', () => {
  it('keeps a RON invoice as stated by the supplier', () => {
    const a = purchaseAmounts(parseUblInvoice(fixture('ubl-invoice-fct0005.xml')))
    expect(a).toMatchObject({ converted: true, currency: 'RON', exchangeRate: null, subtotal: 89998, vat: 18899.58, total: 108897.58 })
    expect(a.lines[0]).toMatchObject({ quantity: 3, unit_price: 23000, tva_rate: 21, total: 83490, unit_code: 'H87' })
  })

  it('converts an EUR credit note to negative RON amounts using the RON VAT', () => {
    const a = purchaseAmounts(parseUblInvoice(fixture('ubl-creditnote-eur.xml')))
    expect(a.converted).toBe(true)
    expect(a.currency).toBe('RON')
    expect(a.exchangeRate).toBe(5.0852)
    expect(a.subtotal).toBe(-508.52)
    expect(a.vat).toBe(-106.79)
    expect(a.total).toBe(-615.31)
    expect(a.lines[0]).toMatchObject({ quantity: -4, unit_price: 127.13, total: -615.31 })
  })
})
