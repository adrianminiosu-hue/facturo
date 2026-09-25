import { describe, expect, it } from 'vitest'
import { isStareNok, isStareOk, isStareProcessing, parseStareResponse, parseUploadResponse, xmlErrorMessages } from './anafEfactura'

describe('ANAF upload response', () => {
  it('reads the attributes of an accepted upload', () => {
    const r = parseUploadResponse('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" dateResponse="202609251140" ExecutionStatus="0" index_incarcare="5001234567"/>')
    expect(r.executionStatus).toBe('0')
    expect(r.indexIncarcare).toBe('5001234567')
    expect(r.error).toBeUndefined()
  })

  it('reads a refused upload with its error message', () => {
    const r = parseUploadResponse('<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" dateResponse="202609251140" ExecutionStatus="1"><Errors errorMessage="Fisierul transmis nu este valid. cvc-complex-type.2.4.a"/></header>')
    expect(r.executionStatus).toBe('1')
    expect(r.indexIncarcare).toBeUndefined()
    expect(r.error).toContain('Fisierul transmis nu este valid')
  })

  it('never treats a response without an upload index as accepted', () => {
    expect(parseUploadResponse('<header ExecutionStatus="0"/>').executionStatus).toBe('1')
    expect(parseUploadResponse('<html>Service unavailable</html>').executionStatus).toBe('1')
  })

  it('still understands child elements (older format / simulation)', () => {
    const r = parseUploadResponse('<header><ExecutionStatus>0</ExecutionStatus><index_incarcare>42</index_incarcare></header>')
    expect(r.executionStatus).toBe('0')
    expect(r.indexIncarcare).toBe('42')
  })
})

describe('ANAF stareMesaj response', () => {
  it('reads ok / nok / processing / invalid XML', () => {
    const ok = parseStareResponse('<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" stare="ok" id_descarcare="3001234567"/>')
    expect(ok.stare).toBe('ok')
    expect(ok.idDescarcare).toBe('3001234567')
    expect(isStareOk(ok.stare)).toBe(true)

    const nok = parseStareResponse('<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" stare="nok" id_descarcare="3001234568"/>')
    expect(isStareNok(nok.stare)).toBe(true)

    const busy = parseStareResponse('<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" stare="in prelucrare"/>')
    expect(isStareProcessing(busy.stare)).toBe(true)
    expect(isStareNok(busy.stare)).toBe(false)

    const invalid = parseStareResponse('<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" stare="XML cu erori nepreluat de sistem"/>')
    expect(isStareNok(invalid.stare)).toBe(true)
    expect(isStareProcessing(invalid.stare)).toBe(false)
  })

  it('surfaces errors such as a wrong id or missing rights', () => {
    const r = parseStareResponse('<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1"><Errors errorMessage="Nu aveti dreptul de inteorgare pentru id_incarcare= 123"/></header>')
    expect(r.stare).toBeUndefined()
    expect(r.error).toContain('Nu aveti dreptul')
  })
})

describe('error archive', () => {
  it('collects every <Error errorMessage> from the error XML', () => {
    const xml = '<header xmlns="mfp:anaf:dgti:efactura:mesajEroriFactuta:v1" Index_incarcare="5001234567" Cif_emitent="12345678"><Error errorMessage="E: validari globale sintactice [BR-RO-110] ..."/><Error errorMessage="E: [BR-CO-15] total &amp; TVA"/></header>'
    expect(xmlErrorMessages(xml)).toEqual(['E: validari globale sintactice [BR-RO-110] ...', 'E: [BR-CO-15] total & TVA'])
  })
})
