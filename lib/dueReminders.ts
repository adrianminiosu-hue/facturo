import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { loadSeller } from '@/lib/loadSeller'
import { calendarDateInBucharest, formatRoDate } from '@/lib/dates'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export type ReminderResult = {
  invoiceId: string
  invoiceRef: string
  clientEmail?: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
}

function reminderHtml(invoice: any, client: any, seller: any) {
  const ref = `${invoice.series}${invoice.invoice_number}`
  const total = Number(invoice.total).toFixed(2)
  const due = formatRoDate(invoice.due_date || invoice.issue_date)
  const sellerName = seller?.company_name || 'Facturo'

  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #0e1218;">
      <p style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #3e536b; margin: 0 0 16px;">
        Reminder de plată
      </p>
      <h1 style="font-size: 28px; font-weight: 400; margin: 0 0 16px;">Scadența este în 2 zile.</h1>
      <p style="font-family: Arial, sans-serif; color: #5c6573; line-height: 1.6;">
        Bună ziua${client?.company_name ? `, <strong style="color:#0e1218">${client.company_name}</strong>` : ''},
      </p>
      <p style="font-family: Arial, sans-serif; color: #5c6573; line-height: 1.6;">
        Vă reamintim cu respect că factura <strong style="color:#0e1218">${ref}</strong>
        emisă de <strong style="color:#0e1218">${sellerName}</strong> ajunge la scadență pe
        <strong style="color:#0e1218">${due}</strong>.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-family: Arial, sans-serif; font-size: 14px;">
        <tr style="background: #f4f6f9;">
          <td style="padding: 12px; border: 1px solid #e4e8ef;">Factură</td>
          <td style="padding: 12px; border: 1px solid #e4e8ef;">${ref}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e4e8ef;">Scadență</td>
          <td style="padding: 12px; border: 1px solid #e4e8ef;">${due}</td>
        </tr>
        <tr style="background: #f4f6f9;">
          <td style="padding: 12px; border: 1px solid #e4e8ef;">Total de plată</td>
          <td style="padding: 12px; border: 1px solid #e4e8ef; font-weight: bold;">${total} RON</td>
        </tr>
      </table>
      ${seller?.iban ? `
      <div style="background: #f4f6f9; padding: 16px; border-radius: 12px; font-family: Arial, sans-serif; font-size: 14px; color: #5c6573;">
        <p style="margin: 0 0 8px; color: #0e1218;"><strong>Date de plată</strong></p>
        <p style="margin: 4px 0;">Beneficiar: ${sellerName}</p>
        <p style="margin: 4px 0;">IBAN: ${seller.iban}</p>
        ${seller.bank_name ? `<p style="margin: 4px 0;">Bancă: ${seller.bank_name}</p>` : ''}
        <p style="margin: 4px 0;">Referință: ${ref}</p>
      </div>
      ` : ''}
      <p style="font-family: Arial, sans-serif; color: #5c6573; line-height: 1.6; margin-top: 24px;">
        Dacă plata a fost deja efectuată, vă rugăm să ignorați acest mesaj.
      </p>
      <p style="font-family: Arial, sans-serif; color: #5c6573;">Cu stimă,<br/>${sellerName}</p>
      <p style="font-family: Arial, sans-serif; color: #9aa5b4; font-size: 12px; margin-top: 28px;">
        Mesaj automat Facturo · nu răspundeți la acest email dacă nu este necesar
      </p>
    </div>
  `
}

async function pdfAttachment(invoice: any) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/invoice-pdf?id=${invoice.id}&userId=${invoice.user_id}`)
    if (!res.ok) return undefined
    const buffer = Buffer.from(await res.arrayBuffer()).toString('base64')
    return {
      filename: `Factura-${invoice.series}${invoice.invoice_number}.pdf`,
      content: buffer
    }
  } catch {
    return undefined
  }
}

export async function runDueReminders(options: { dryRun?: boolean } = {}) {
  const dueDate = calendarDateInBucharest(2)
  const first = await supabase
    .from('invoices')
    .select('id, user_id, company_id, client_id, series, invoice_number, issue_date, due_date, total, status, reminder_sent_at')
    .eq('due_date', dueDate)
    .in('status', ['sent', 'overdue'])
  let invoices: any[] | null = first.data
  let error = first.error

  if (error) {
    const fallback = await supabase
      .from('invoices')
      .select('id, user_id, company_id, client_id, series, invoice_number, issue_date, due_date, total, status')
      .eq('due_date', dueDate)
      .in('status', ['sent', 'overdue'])
    invoices = fallback.data
    error = fallback.error
  }

  if (error) {
    throw new Error(error.message)
  }

  const due = (invoices || []).filter((inv: { reminder_sent_at?: string | null }) => !inv.reminder_sent_at)
  const results: ReminderResult[] = []

  for (const invoice of due) {
    const invoiceRef = `${invoice.series}${invoice.invoice_number}`
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', invoice.client_id)
      .single()

    if (!client?.email) {
      results.push({ invoiceId: invoice.id, invoiceRef, status: 'skipped', reason: 'Clientul nu are email' })
      continue
    }

    if (options.dryRun) {
      results.push({ invoiceId: invoice.id, invoiceRef, clientEmail: client.email, status: 'skipped', reason: 'dry-run' })
      continue
    }

    const seller = await loadSeller(supabase, invoice, invoice.user_id)
    const attachment = await pdfAttachment(invoice)

    const { error: sendError } = await resend.emails.send({
      from: `${seller?.company_name || 'Facturo'} <onboarding@resend.dev>`,
      to: [client.email],
      subject: `Reminder de plată · factura ${invoiceRef} scade pe ${formatRoDate(invoice.due_date)}`,
      html: reminderHtml(invoice, client, seller),
      attachments: attachment ? [attachment] : undefined
    })

    if (sendError) {
      results.push({ invoiceId: invoice.id, invoiceRef, clientEmail: client.email, status: 'failed', reason: sendError.message })
      continue
    }

    await supabase
      .from('invoices')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', invoice.id)

    results.push({ invoiceId: invoice.id, invoiceRef, clientEmail: client.email, status: 'sent' })
  }

  return {
    dueDate,
    dryRun: !!options.dryRun,
    scanned: (invoices || []).length,
    results
  }
}
