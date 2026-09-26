import { NextRequest, NextResponse } from 'next/server'
import { actorCanAccessOwner, getCompanyForActor } from '@/lib/portfolio'
import { authenticatedUserId, unauthorized } from '@/lib/serverAuth'
import { createClient } from '@supabase/supabase-js'
import ReactPDF, { Document, Page, Text, View, StyleSheet, Font, Svg, Circle, Path } from '@react-pdf/renderer'
import { findSimulatedPurchaseInvoice, type PurchaseBuyer, type SimulatedPurchaseInvoice } from '@/lib/efacturaPurchaseImport'
import { loadRegisteredPurchaseInvoice, purchaseInvoiceFromRow } from '@/lib/purchaseInvoicePersist'
import { formatRoDate } from '@/lib/dates'
import { formatAmount, formatRon } from '@/lib/money'
import { BRAND } from '@/lib/brand'

Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf', fontWeight: 'normal' },
    { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAw.ttf', fontWeight: 'bold' }
  ]
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    backgroundColor: '#ffffff'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  invoiceTitle: {
    fontSize: 22,
    fontFamily: 'Roboto',
    fontWeight: 'bold',
    color: '#111111',
    textAlign: 'right'
  },
  invoiceNumber: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'right',
    marginTop: 4
  },
  textGray: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 2
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginVertical: 14
  },
  twoCol: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  col: { width: '45%' },
  sectionLabel: {
    fontSize: 8,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: 'Roboto',
    fontWeight: 'bold'
  },
  text: {
    fontSize: 10,
    color: '#111111',
    marginBottom: 3,
    lineHeight: 1.4
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 12
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: 'Roboto',
    fontWeight: 'bold',
    color: '#6b7280',
    textTransform: 'uppercase'
  },
  tableText: { fontSize: 10, color: '#111111' },
  col1: { width: '36%' },
  col2: { width: '10%' },
  col3: { width: '10%' },
  col4: { width: '16%' },
  col5: { width: '10%' },
  col6: { width: '18%' },
  totalsSection: { marginTop: 16, alignItems: 'flex-end' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    paddingVertical: 3
  },
  totalLabel: { fontSize: 10, color: '#6b7280' },
  totalValue: { fontSize: 10, color: '#111111', fontFamily: 'Roboto', fontWeight: 'bold' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginTop: 4
  },
  grandTotalLabel: { fontSize: 12, fontFamily: 'Roboto', fontWeight: 'bold', color: '#111111' },
  grandTotalValue: { fontSize: 12, fontFamily: 'Roboto', fontWeight: 'bold', color: '#111111' },
  sealWrap: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  sealMeta: { flexGrow: 1 },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8
  }
})

function lineNet(line: SimulatedPurchaseInvoice['lines'][number]) {
  return Math.round(line.quantity * line.unitPrice * 100) / 100
}

function SealMark() {
  return (
    <Svg width={88} height={88} viewBox="0 0 88 88">
      <Circle cx="44" cy="44" r="40" stroke="#0f766e" strokeWidth="3" fill="#f0fdfa" />
      <Circle cx="44" cy="44" r="32" stroke="#0f766e" strokeWidth="1.2" fill="none" />
      <Path d="M28 45 l8 8 16-18" stroke="#0f766e" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function PurchaseInvoicePDF({ invoice }: { invoice: SimulatedPurchaseInvoice }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 11, color: '#0f766e', fontFamily: 'Roboto', fontWeight: 'bold', marginBottom: 6 }}>
              e-Factura SPV · simulare test
            </Text>
            <Text style={{ fontSize: 16, fontFamily: 'Roboto', fontWeight: 'bold', marginBottom: 4 }}>
              {invoice.supplierName}
            </Text>
            <Text style={styles.textGray}>CUI: {invoice.supplierCui}</Text>
            <Text style={styles.textGray}>{invoice.supplierAddress}</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>FACTURĂ</Text>
            <Text style={styles.invoiceNumber}>Nr. {invoice.series}{invoice.invoiceNumber}</Text>
            <Text style={[styles.textGray, { textAlign: 'right', marginTop: 8 }]}>Data: {formatRoDate(invoice.issueDate)}</Text>
            <Text style={[styles.textGray, { textAlign: 'right' }]}>Scadență: {formatRoDate(invoice.dueDate)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Furnizor</Text>
            <Text style={styles.text}>{invoice.supplierName}</Text>
            <Text style={styles.textGray}>CUI: {invoice.supplierCui}</Text>
            <Text style={styles.textGray}>{invoice.supplierAddress}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Cumpărător</Text>
            <Text style={styles.text}>{invoice.buyerName}</Text>
            <Text style={styles.textGray}>CUI: {invoice.buyerCui}</Text>
            <Text style={styles.textGray}>{invoice.buyerAddress}</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.col1]}>Descriere</Text>
          <Text style={[styles.tableHeaderText, styles.col2]}>UM</Text>
          <Text style={[styles.tableHeaderText, styles.col3]}>Cant.</Text>
          <Text style={[styles.tableHeaderText, styles.col4]}>Preț unitar</Text>
          <Text style={[styles.tableHeaderText, styles.col5]}>TVA%</Text>
          <Text style={[styles.tableHeaderText, styles.col6]}>Total</Text>
        </View>
        {invoice.lines.map((line, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableText, styles.col1]}>{line.description}</Text>
            <Text style={[styles.tableText, styles.col2, { textAlign: 'center' }]}>{line.unit}</Text>
            <Text style={[styles.tableText, styles.col3, { textAlign: 'center' }]}>{line.quantity}</Text>
            <Text style={[styles.tableText, styles.col4, { textAlign: 'right' }]}>{formatAmount(line.unitPrice)}</Text>
            <Text style={[styles.tableText, styles.col5, { textAlign: 'center' }]}>{line.vatRate}%</Text>
            <Text style={[styles.tableText, styles.col6, { textAlign: 'right' }]}>{formatRon(lineNet(line))}</Text>
          </View>
        ))}

        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Bază</Text>
            <Text style={styles.totalValue}>{formatRon(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TVA 19%</Text>
            <Text style={styles.totalValue}>{formatRon(invoice.vat)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotalValue}>{formatRon(invoice.total)}</Text>
          </View>
        </View>

        <View style={styles.sealWrap}>
          <SealMark />
          <View style={styles.sealMeta}>
            <Text style={{ fontSize: 11, fontFamily: 'Roboto', fontWeight: 'bold', color: '#0f766e', marginBottom: 4 }}>
              Sigiliu electronic e-Factura · VALID
            </Text>
            <Text style={styles.textGray}>{invoice.seal.issuer}</Text>
            <Text style={styles.textGray}>Semnat: {invoice.seal.signedAt}</Text>
            <Text style={styles.textGray}>Certificat: {invoice.seal.certificate}</Text>
            <Text style={styles.textGray}>Serial: {invoice.seal.serial}</Text>
            <Text style={styles.textGray}>Index încărcare: {invoice.indexIncarcare}</Text>
            <Text style={styles.textGray}>{invoice.seal.algorithm} · {invoice.seal.digest.slice(0, 16)}…</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Document descărcat din e-Factura SPV (simulare test ANAF) · {BRAND.name}
        </Text>
      </Page>
    </Document>
  )
}

async function loadBuyer(userId: string, companyId?: string | null): Promise<PurchaseBuyer> {
  if (companyId) {
    const { data } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle()
    if (data) return data
  }
  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if (companies?.[0]) return companies[0]
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return profile || { company_name: 'Firma ta', cui: '' }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('id')
    const userId = await authenticatedUserId(request)
    if (!userId) return unauthorized()
    const companyId = searchParams.get('companyId')

    if (!invoiceId || !userId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    if (companyId && !(await getCompanyForActor(supabase, companyId, userId))) {
      return NextResponse.json({ error: 'Nu ai acces la această firmă.' }, { status: 403 })
    }
    const stored = await loadBuyer(userId, companyId)
    const registered = await loadRegisteredPurchaseInvoice(supabase, invoiceId)
    if (registered && !(await actorCanAccessOwner(supabase, userId, (registered as { user_id?: string }).user_id))) {
      return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })
    }
    const invoice = registered
      ? purchaseInvoiceFromRow({ invoice: registered, buyer: stored })
      : findSimulatedPurchaseInvoice({ ...stored, id: companyId || stored.id || userId }, invoiceId)
    if (!invoice) {
      return NextResponse.json({ error: 'Factura nu a fost găsită în e-Factura' }, { status: 404 })
    }

    const stream = await ReactPDF.renderToStream(<PurchaseInvoicePDF invoice={invoice} />)
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="e-Factura-${invoice.series}${invoice.invoiceNumber}.pdf"`
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eroare PDF'
    console.error('Purchase PDF error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
