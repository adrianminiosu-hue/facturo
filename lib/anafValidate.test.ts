import { describe, expect, it } from 'vitest'
import { parseValidationResponse, readableValidationErrors, validationStandard } from './anafValidate'
import { BRAND } from './brand'

describe('ANAF validator response', () => {
  it('reads ok / nok', () => {
    expect(parseValidationResponse({ stare: 'ok', trace_id: 't1' })).toMatchObject({ ok: true, messages: [], traceId: 't1' })
    const nok = parseValidationResponse({ stare: 'nok', Messages: [{ message: 'E: x' }] })
    expect(nok.ok).toBe(false)
    expect(nok.messages).toEqual(['E: x'])
  })

  it('turns ANAF rule messages into short readable lines', () => {
    const raw = 'tipAssert=FailedAssert; codEroare=BR-RO-110; localizareEroare=/Invoice; textEroare=[BR-RO-110]-Daca Codul tarii Vanzatorului (BT-40) este RO, atunci Subdiviziunea ... ISO 3166-2:RO.     #If the Seller\'s country Code ...; expresieValidata=... || tipAssert=E; codEroare=ERRIdentif; textEroare=CUI vanzator incorect'
    expect(readableValidationErrors([raw])).toEqual([
      'BR-RO-110: Daca Codul tarii Vanzatorului (BT-40) este RO, atunci Subdiviziunea ... ISO 3166-2:RO.',
      'CUI: CUI vanzator incorect'
    ])
  })

  it('reports schema errors as a Facturo problem, not a data problem', () => {
    const raw = "Fisierul transmis nu este valid. org.xml.sax.SAXParseException; lineNumber: 10; cvc-complex-type.2.4.a: Invalid content"
    expect(readableValidationErrors([raw])[0]).toContain(`eroare tehnică ${BRAND.name}`)
  })

  it('uses FCN for credit notes', () => {
    expect(validationStandard('381')).toBe('FCN')
    expect(validationStandard('380')).toBe('FACT1')
  })
})
