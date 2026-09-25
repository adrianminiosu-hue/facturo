import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseUblInvoice, readAnafSignature, splitInvoiceId } from './ublInvoice'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

describe('parseUblInvoice', () => {
  it('reads a CIUS-RO invoice (real Facturo XML validated by ANAF)', () => {
    const inv = parseUblInvoice(fixture('ubl-invoice-fct0005.xml'))
    expect(inv.isCreditNote).toBe(false)
    expect(inv.typeCode).toBe('380')
    expect(inv.id).toBe('FCT0005')
    expect(inv.series).toBe('FCT')
    expect(inv.number).toBe('0005')
    expect(inv.issueDate).toBe('2026-09-13')
    expect(inv.dueDate).toBe('2026-09-28')
    expect(inv.currency).toBe('RON')
    expect(inv.fxRate).toBeNull()
    expect(inv.supplier).toMatchObject({ name: 'Finsquare IT Solutions', cui: '12312343', vatId: 'RO12312343', city: 'SECTOR6', county: 'RO-B', country: 'RO' })
    expect(inv.customer.cui).toBe('8971726')
    expect(inv.lines).toHaveLength(2)
    expect(inv.lines[0]).toMatchObject({ description: 'Servicii consultanta IT', quantity: 3, unitCode: 'H87', unitPrice: 23000, net: 69000, vatRate: 21, vatCategory: 'S' })
    expect(inv.totals).toEqual({ net: 89998, vat: 18899.58, total: 108897.58, prepaid: 0, payable: 108897.58 })
    expect(inv.notes).toEqual(['Plata prin virament bancar.'])
  })

  it('reads a supplier credit note in EUR with VAT stated in RON', () => {
    const cn = parseUblInvoice(fixture('ubl-creditnote-eur.xml'))
    expect(cn.isCreditNote).toBe(true)
    expect(cn.typeCode).toBe('381')
    expect(cn.series).toBe('CN')
    expect(cn.number).toBe('2026/0042')
    expect(cn.dueDate).toBe('2026-10-05')
    expect(cn.currency).toBe('EUR')
    expect(cn.fxRate).toBe(5.0852)
    expect(cn.supplier).toMatchObject({ name: 'TOOLS & PARTS S.R.L.', cui: '14399840', city: 'Cluj-Napoca', county: 'RO-CJ' })
    expect(cn.customer.cui).toBe('12312343')
    expect(cn.lines[0]).toMatchObject({ quantity: 4, unitCode: 'C62', unitPrice: 25, net: 100, vatRate: 21 })
    expect(cn.totals.vat).toBe(21)
    expect(cn.notes).toEqual(['Retur marfa & discount'])
  })

  it('refuses documents that are not invoices', () => {
    expect(() => parseUblInvoice('<header xmlns="mfp:anaf"/>')).toThrow('nu este o factură')
  })
})

describe('splitInvoiceId', () => {
  it('splits series and number the usual ways', () => {
    expect(splitInvoiceId('NT1048')).toEqual({ series: 'NT', number: '1048' })
    expect(splitInvoiceId('FCT 0032')).toEqual({ series: 'FCT', number: '0032' })
    expect(splitInvoiceId('B-123')).toEqual({ series: 'B', number: '123' })
    expect(splitInvoiceId('12345')).toEqual({ series: '', number: '12345' })
  })
})

describe('readAnafSignature', () => {
  it('reads the metadata of ANAF signature file', () => {
    expect(readAnafSignature(fixture('anaf-semnatura.xml'))).toEqual({
      subject: 'CN=ANAF e-Factura, O=MINISTERUL FINANTELOR, C=RO',
      serial: '1234567890',
      signedAt: '2026-09-21T10:15:00Z',
      algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      digest: 'abcDEF123=='
    })
  })
})
