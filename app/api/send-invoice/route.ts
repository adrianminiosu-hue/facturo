import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, userId } = await request.json()

    // Fetch invoice data
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

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

    if (!client?.email) {
      return NextResponse.json({ error: 'Clientul nu are email setat' }, { status: 400 })
    }

    // Generate PDF
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const pdfRes = await fetch(`${baseUrl}/api/invoice-pdf?id=${invoiceId}&userId=${userId}`)
    const pdfBuffer = await pdfRes.arrayBuffer()
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

    // Send email
    const { data, error } = await resend.emails.send({
      from: `${profile?.company_name || 'Facturo'} <onboarding@resend.dev>`,
      to: [client.email],
      subject: `Factură ${invoice.series}${invoice.invoice_number} - ${profile?.company_name || ''}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #111111;">Factură nouă</h2>
          <p style="color: #666666;">Bună ziua,</p>
          <p style="color: #666666;">
            Vă transmitem alăturat factura <strong>${invoice.series}${invoice.invoice_number}</strong> 
            în valoare de <strong>${Number(invoice.total).toFixed(2)} RON</strong>.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f9fafb;">
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Număr factură</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${invoice.series}${invoice.invoice_number}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Data emiterii</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${invoice.issue_date}</td>
            </tr>
            <tr style="background: #f9fafb;">
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Scadență</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${invoice.due_date || invoice.issue_date}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Total de plată</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; color: #111111; font-weight: bold;">${Number(invoice.total).toFixed(2)} RON</td>
            </tr>
          </table>
          ${profile?.iban ? `
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #666666; font-size: 14px;"><strong>Date plată:</strong></p>
            <p style="margin: 4px 0; color: #666666; font-size: 14px;">Beneficiar: ${profile.company_name}</p>
            <p style="margin: 4px 0; color: #666666; font-size: 14px;">IBAN: ${profile.iban}</p>
            ${profile.bank_name ? `<p style="margin: 4px 0; color: #666666; font-size: 14px;">Bancă: ${profile.bank_name}</p>` : ''}
            <p style="margin: 4px 0; color: #666666; font-size: 14px;">Referință: ${invoice.series}${invoice.invoice_number}</p>
          </div>
          ` : ''}
          <p style="color: #666666;">Factura este atașată acestui email în format PDF.</p>
          <p style="color: #666666;">Vă mulțumim!</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">
            ${profile?.company_name || ''} · ${profile?.email || ''} · ${profile?.phone || ''}
          </p>
          <p style="color: #d1d5db; font-size: 11px;">Factură generată cu Facturo · facturo.ro</p>
        </div>
      `,
      attachments: [
        {
          filename: `Factura-${invoice.series}${invoice.invoice_number}.pdf`,
          content: pdfBase64
        }
      ]
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update invoice status to sent
    await supabase
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', invoiceId)

    return NextResponse.json({ success: true })

  } catch (e: any) {
    console.error('Email error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}