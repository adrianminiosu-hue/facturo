/**
 * A plain-language hint next to ANAF's own message, so the user knows what to fix.
 * Matched on words that appear in ANAF validation and transport messages; the original text is always shown too.
 */
const HINTS: Array<{ test: RegExp; key: string }> = [
  { test: /deja (a fost )?transmis|duplicat|already/i, key: 'efd.hint.duplicate' },
  { test: /CountrySubentity|jude[tț]|county|BR-RO-11\d/i, key: 'efd.hint.county' },
  { test: /CityName|localitat|sector/i, key: 'efd.hint.city' },
  { test: /CompanyID|cod(ul)? fiscal|\bCUI\b|\bCIF\b|VAT identifier|BR-CO-09|BR-RO-06\d/i, key: 'efd.hint.cui' },
  { test: /IBAN|PayeeFinancialAccount|PaymentMeans/i, key: 'efd.hint.iban' },
  { test: /IssueDate|DueDate|TaxPointDate|dat[aă] (emiterii|scaden)/i, key: 'efd.hint.date' },
  { test: /BR-CO-1\d|BR-CO-2\d|LineExtensionAmount|TaxInclusiveAmount|PayableAmount|total/i, key: 'efd.hint.totals' },
  { test: /BR-(S|Z|E|AE|K|G|O)-|TaxCategory|categori[ae] (de )?TVA|scutire|exemption/i, key: 'efd.hint.vat' },
  { test: /\b40[13]\b|token|autoriz|unauthori[sz]ed|forbidden|certificat/i, key: 'efd.hint.auth' },
  { test: /\b50\d\b|timeout|indisponibil|unavailable|ECONN|fetch failed/i, key: 'efd.hint.outage' },
  { test: /localitate|adres|StreetName|PostalAddress/i, key: 'efd.hint.address' }
]

export function anafErrorHint(message?: string | null) {
  const text = String(message || '')
  if (!text) return null
  return HINTS.find(hint => hint.test.test(text))?.key || null
}
