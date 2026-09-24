import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(url, key)

const companyId = '835e6b6d-dfd3-46e3-967d-935cbfc305f6'
const companyIban = 'RO49INGB90901212233RON01'
const MAX_LINES = 5

const { data: invoices, error } = await supabase
  .from('invoices')
  .select('id, series, invoice_number, status, direction, total, amount_paid, prepaid_amount, invoice_type_code, clients(company_name, cui, iban)')
  .eq('company_id', companyId)
if (error) throw new Error(error.message)

const { data: pays } = await supabase
  .from('invoice_payments')
  .select('invoice_id, amount, source, match_rule, bank_transaction_id')
  .eq('company_id', companyId)

const { data: txs } = await supabase
  .from('bank_transactions')
  .select('id, source, provider_tx_id, description')
  .eq('company_id', companyId)

const testTxIds = new Set((txs || []).filter(tx => (
  tx.source === 'camt053'
  && (
    String(tx.provider_tx_id || '').startsWith('INGREF')
    || String(tx.provider_tx_id || '').startsWith('INGFEE')
    || String(tx.description || '').startsWith('Plata factura FCT')
    || String(tx.description || '').includes('Comision administrare cont')
  )
)).map(tx => tx.id))

function paidAfterCleanup(invoiceId) {
  return (pays || [])
    .filter(payment => {
      if (payment.invoice_id !== invoiceId) return false
      const fromTestTx = payment.bank_transaction_id && testTxIds.has(payment.bank_transaction_id)
      if (fromTestTx && payment.source === 'camt053') return false
      return true
    })
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
}

function remaining(inv) {
  return Number(inv.total || 0) - Number(inv.prepaid_amount || 0) - paidAfterCleanup(inv.id)
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cleanIban(value) {
  return String(value || '').replace(/[\s`]/g, '').toUpperCase()
}

const preferred = ['FCT0001', 'FCT0014', 'FCT0023', 'FCT0027', 'FCT0029']
const open = (invoices || [])
  .filter(inv => (
    inv.direction !== 'purchase'
    && inv.status !== 'draft'
    && inv.invoice_type_code !== '381'
    && inv.invoice_type_code !== '384'
    && remaining(inv) > 0.01
  ))
  .map(inv => ({ inv, ref: `${inv.series || ''}${inv.invoice_number || ''}`, rem: remaining(inv) }))
  .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }))

const picked = preferred
  .map(ref => open.find(row => row.ref === ref))
  .filter(Boolean)
  .slice(0, MAX_LINES)

const extra = open.filter(row => !picked.some(item => item.inv.id === row.inv.id))
const rows = [...picked, ...extra].slice(0, MAX_LINES)

const entries = rows.map((row, index) => {
  const ref = row.ref
  const name = row.inv.clients?.company_name || 'Client'
  const iban = cleanIban(row.inv.clients?.iban)
  const cui = String(row.inv.clients?.cui || '').replace(/^RO/i, '')
  const id = String(index + 1).padStart(3, '0')
  const dbtrAcct = iban ? `<DbtrAcct><Id><IBAN>${xmlEscape(iban)}</IBAN></Id></DbtrAcct>` : ''
  const orgId = cui ? `<Id><OrgId><Othr><Id>RO${xmlEscape(cui)}</Id></Othr></OrgId></Id>` : ''
  return `      <Ntry>
        <NtryRef>NTRY-${id}</NtryRef>
        <Amt Ccy="RON">${row.rem.toFixed(2)}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-09-25</Dt></BookgDt>
        <ValDt><Dt>2026-09-25</Dt></ValDt>
        <AcctSvcrRef>INGOPEN${id}</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>${xmlEscape(ref)}</EndToEndId></Refs>
            <RltdPties>
              <Dbtr>
                <Nm>${xmlEscape(name)}</Nm>
                ${orgId}
              </Dbtr>
              ${dbtrAcct}
            </RltdPties>
            <RmtInf><Ustrd>Plata factura ${xmlEscape(ref)}</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>`
})

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>FINSQUARE-OPEN-EXTRAS-20260925</MsgId>
      <CreDtTm>2026-09-25T12:00:00</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>EXTRAS-ING-FINSQUARE-OPEN-20260925</Id>
      <CreDtTm>2026-09-25T12:00:00</CreDtTm>
      <Acct>
        <Id><IBAN>${companyIban}</IBAN></Id>
        <Ccy>RON</Ccy>
      </Acct>
${entries.join('\n')}
    </Stmt>
  </BkToCstmrStmt>
</Document>
`

const out = '__fixtures__/bank/finsquare-it-solutions-test-extras.xml'
writeFileSync(out, xml)
console.log(JSON.stringify({
  file: out,
  company: 'Finsquare IT Solutions',
  statementIban: companyIban,
  openInDatabase: open.length,
  credits: rows.length,
  skippedFullyPaid: (invoices || []).length - open.length,
  lines: rows.map(row => ({
    ref: row.ref,
    amount: row.rem,
    client: row.inv.clients?.company_name,
    iban: cleanIban(row.inv.clients?.iban)
  }))
}, null, 2))
