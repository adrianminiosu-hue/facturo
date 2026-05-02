import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ReactPDF, { Document, Page, Text, View, StyleSheet, Font, Svg, Rect, Path, Circle } from '@react-pdf/renderer'
Font.register({
  family: 'Roboto',
  fonts: [
    { src: process.cwd() + '/public/fonts/Roboto-Regular.ttf', fontWeight: 'normal' },
    { src: process.cwd() + '/public/fonts/Roboto-Bold.ttf', fontWeight: 'bold' }
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
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    backgroundColor: '#ffffff'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  companyName: {
    fontSize: 18,
    fontFamily: 'Roboto', fontWeight: 'bold',
    marginBottom: 0
  },
  invoiceTitle: {
    fontSize: 24,
    fontFamily: 'Roboto', fontWeight: 'bold',      
    color: '#111111',
    textAlign: 'right'
  },
  invoiceNumber: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'right',
    marginTop: 4
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginVertical: 16
  },
  twoCol: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  col: {
    width: '45%'
  },
  sectionLabel: {
    fontSize: 8,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: 'Roboto', fontWeight: 'bold'
  },
  text: {
    fontSize: 10,
    color: '#111111',
    marginBottom: 3,
    lineHeight: 1.4
  },
  textGray: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 2
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 16
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
    fontFamily: 'Roboto', fontWeight: 'bold',
    color: '#6b7280',
    textTransform: 'uppercase'
  },
  tableText: {
    fontSize: 10,
    color: '#111111'
  },
  col1: { width: '40%' },
  col2: { width: '15%', textAlign: 'center' },
  col3: { width: '20%', textAlign: 'right' },
  col4: { width: '10%', textAlign: 'center' },
  col5: { width: '15%', textAlign: 'right' },
  totalsSection: {
    marginTop: 16,
    alignItems: 'flex-end'
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    paddingVertical: 3
  },
  totalLabel: {
    fontSize: 10,
    color: '#6b7280'
  },
  totalValue: {
    fontSize: 10,
    color: '#111111',
    fontFamily: 'Roboto', fontWeight: 'bold'
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginTop: 4
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: 'Roboto', fontWeight: 'bold',
    color: '#111111'
  },
  grandTotalValue: {
    fontSize: 12,
    fontFamily: 'Roboto', fontWeight: 'bold',
    color: '#111111'
  },
  notes: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 4
  },
  notesLabel: {
    fontSize: 8,
    fontFamily: 'Roboto', fontWeight: 'bold',
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 4
  },
  notesText: {
    fontSize: 9,
    color: '#6b7280'
  },
  footer: {
    position: 'absolute',
    bottom: 30,
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

const InvoicePDF = ({ invoice, items, client, profile }: any) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.brandRow}>
            {/* Simple navy tech/innovation mark (vector) */}
            <Svg width={18} height={18} viewBox="0 0 64 64">
              <Rect x="6" y="6" width="52" height="52" rx="14" ry="14" fill="#001F54" />
              <Path
                d="M24 22h22v6H30v6h14v6H30v12h-6V22z"
                fill="#FFFFFF"
                opacity={0.98}
              />
              {/* subtle circuit node */}
              <Circle cx="46" cy="22" r="4" fill="#FFFFFF" opacity={0.9} />
              <Path d="M42 22H34" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity={0.6} />
            </Svg>
            <Text style={styles.companyName}>{profile?.company_name || 'Compania Mea'}</Text>
          </View>
          <Text style={styles.textGray}>CUI: {profile?.cui || '—'}</Text>
          <Text style={styles.textGray}>Reg. Com: {profile?.reg_com || '—'}</Text>
          <Text style={styles.textGray}>{profile?.address || '—'}</Text>
          <Text style={styles.textGray}>{profile?.city || '—'}</Text>
        </View>
        <View>
          <Text style={styles.invoiceTitle}>FACTURĂ</Text>
          <Text style={styles.invoiceNumber}>Nr. {invoice.series}{invoice.invoice_number}</Text>
          <Text style={[styles.textGray, { textAlign: 'right', marginTop: 8 }]}>
            Data: {invoice.issue_date}
          </Text>
          <Text style={[styles.textGray, { textAlign: 'right' }]}>
            Scadență: {invoice.due_date || invoice.issue_date}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Seller & Buyer */}
      <View style={styles.twoCol}>
        <View style={styles.col}>
          <Text style={styles.sectionLabel}>Furnizor</Text>
          <Text style={styles.text}>{profile?.company_name || '—'}</Text>
          <Text style={styles.textGray}>CUI: {profile?.cui || '—'}</Text>
          <Text style={styles.textGray}>Reg. Com: {profile?.reg_com || '—'}</Text>
          <Text style={styles.textGray}>{profile?.address || '—'}</Text>
          {profile?.iban && <Text style={styles.textGray}>IBAN: {profile.iban}</Text>}
          {profile?.bank_name && <Text style={styles.textGray}>Bancă: {profile.bank_name}</Text>}
        </View>
        <View style={styles.col}>
          <Text style={styles.sectionLabel}>Cumpărător</Text>
          <Text style={styles.text}>{client?.company_name || '—'}</Text>
          <Text style={styles.textGray}>CUI: {client?.cui || '—'}</Text>
          <Text style={styles.textGray}>Reg. Com: {client?.reg_com || '—'}</Text>
          <Text style={styles.textGray}>{client?.address || '—'}</Text>
          {client?.bank_name && <Text style={styles.textGray}>Bancă: {client.bank_name}</Text>}
          {client?.iban && <Text style={styles.textGray}>IBAN: {client.iban}</Text>}
          <Text style={styles.textGray}>{client?.city || '—'}</Text>
        </View>
      </View>

      {/* Table */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderText, styles.col1]}>Descriere</Text>
        <Text style={[styles.tableHeaderText, styles.col2]}>Cant.</Text>
        <Text style={[styles.tableHeaderText, styles.col3]}>Preț unitar</Text>
        <Text style={[styles.tableHeaderText, styles.col4]}>TVA%</Text>
        <Text style={[styles.tableHeaderText, styles.col5]}>Total</Text>
      </View>
      {items.map((item: any, i: number) => (
        <View key={i} style={styles.tableRow}>
          <Text style={[styles.tableText, styles.col1]}>{item.description}</Text>
          <Text style={[styles.tableText, styles.col2, { textAlign: 'center' }]}>{item.quantity}</Text>
          <Text style={[styles.tableText, styles.col3, { textAlign: 'right' }]}>{Number(item.unit_price).toFixed(2)} RON</Text>
          <Text style={[styles.tableText, styles.col4, { textAlign: 'center' }]}>{item.tva_rate}%</Text>
          <Text style={[styles.tableText, styles.col5, { textAlign: 'right' }]}>{Number(item.total).toFixed(2)} RON</Text>
        </View>
      ))}

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{Number(invoice.subtotal).toFixed(2)} RON</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TVA</Text>
          <Text style={styles.totalValue}>{Number(invoice.tva_amount).toFixed(2)} RON</Text>
        </View>
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>TOTAL</Text>
          <Text style={styles.grandTotalValue}>{Number(invoice.total).toFixed(2)} RON</Text>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={styles.notesLabel}>Mențiuni</Text>
          <Text style={styles.notesText}>{invoice.notes}</Text>
        </View>
      )}

      {/* Footer */}
      <Text style={styles.footer}>
        Generat de Facturo · facturo.ro · {profile?.email || ''}
      </Text>
    </Page>
  </Document>
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('id')
    const userId = searchParams.get('userId')

    if (!invoiceId || !userId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)

    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', invoice.client_id)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    const stream = await ReactPDF.renderToStream(
      <InvoicePDF
        invoice={invoice}
        items={items || []}
        client={client}
        profile={profile}
      />
    )

    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Factura-${invoice.series}${invoice.invoice_number}.pdf"`
      }
    })
  } catch (e: any) {
    console.error('PDF error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}