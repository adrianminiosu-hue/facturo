import { internalHeaders } from '@/lib/serverAuth'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { loadSeller } from '@/lib/loadSeller'
import { calendarDateInBucharest, daysUntilDue, formatRoDate } from '@/lib/dates'
import { FORMAL_NOTICE_OFFSET, dueOffset, effectiveSettings, type ReminderSettings } from '@/lib/reminderSchedule'
import { OPEN_INVOICE_STATUSES, isPurchaseInvoice } from '@/lib/invoiceStatus'
import { formatRon } from '@/lib/money'
import { remainingOf } from '@/lib/invoiceMath'
import { ensureConvertedInvoiceAmounts } from '@/lib/invoicePersist'

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

function reminderHeadline(daysUntil: number) {
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil)
    return `Factura este restantă de ${n} ${n === 1 ? 'zi' : 'zile'}.`
  }
  if (daysUntil === 0) return 'Factura scade astăzi.'
  return `Scadența este în ${daysUntil} ${daysUntil === 1 ? 'zi' : 'zile'}.`
}

function reminderHtml(invoice: any, client: any, seller: any, daysUntil: number, formal = false) {
  const ref = `${invoice.series}${invoice.invoice_number}`
  const outstanding = formatRon(remainingOf(invoice))
  const due = formatRoDate(invoice.due_date || invoice.issue_date)
  const sellerName = seller?.company_name || 'Facturo'

  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #0e1218;">
      <p style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #3e536b; margin: 0 0 16px;">
        ${formal ? 'Somație de plată' : 'Reminder de plată'}
      </p>
      <h1 style="font-size: 28px; font-weight: 400; margin: 0 0 16px;">${reminderHeadline(daysUntil)}</h1>
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
          <td style="padding: 12px; border: 1px solid #e4e8ef; font-weight: bold;">${outstanding}</td>
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
    const res = await fetch(`${baseUrl}/api/invoice-pdf?id=${invoice.id}`, { headers: internalHeaders(invoice.user_id) })
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

export type ReminderOptions = {
  /** Scheduled step (days vs. due date); undefined for a manual reminder. */
  offsetDays?: number
  /** Overrides the client's email (per-client reminder settings). */
  recipient?: string | null
}

async function logReminder(invoice: any, recipient: string, options: ReminderOptions) {
  // The log table may not exist yet on older databases; reminder_sent_at stays the fallback.
  const { error } = await supabase.from('invoice_reminder_log').insert({
    invoice_id: invoice.id,
    user_id: invoice.user_id,
    offset_days: options.offsetDays ?? null,
    kind: options.offsetDays === undefined ? 'manual' : 'auto',
    recipient
  })
  if (error) console.warn('invoice_reminder_log insert skipped:', error.message)
}

export async function sendInvoiceReminder(invoice: any, options: ReminderOptions = {}): Promise<ReminderResult> {
  invoice = await ensureConvertedInvoiceAmounts(supabase, invoice)
  const invoiceRef = `${invoice.series}${invoice.invoice_number}`
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', invoice.client_id)
    .single()

  let recipient = options.recipient || null
  if (!recipient && options.offsetDays === undefined) {
    const { data: settings } = await supabase
      .from('client_reminder_settings')
      .select('recipient_email')
      .eq('client_id', invoice.client_id)
      .maybeSingle()
    recipient = settings?.recipient_email || null
  }
  recipient = recipient || client?.email || null

  if (!recipient) {
    return { invoiceId: invoice.id, invoiceRef, status: 'skipped', reason: 'Clientul nu are email' }
  }

  const seller = await loadSeller(supabase, invoice, invoice.user_id)
  const attachment = await pdfAttachment(invoice)
  const daysUntil = daysUntilDue(invoice.due_date || invoice.issue_date)
  const formal = (options.offsetDays ?? -daysUntil) >= FORMAL_NOTICE_OFFSET

  const { error: sendError } = await resend.emails.send({
    from: `${seller?.company_name || 'Facturo'} <onboarding@resend.dev>`,
    to: [recipient],
    subject: `${formal ? 'Somație de plată' : 'Reminder de plată'} · factura ${invoiceRef} · ${formatRoDate(invoice.due_date || invoice.issue_date)}`,
    html: reminderHtml(invoice, client, seller, daysUntil, formal),
    attachments: attachment ? [attachment] : undefined
  })

  if (sendError) {
    return { invoiceId: invoice.id, invoiceRef, clientEmail: recipient, status: 'failed', reason: sendError.message }
  }

  await supabase
    .from('invoices')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', invoice.id)
  await logReminder(invoice, recipient, options)

  return { invoiceId: invoice.id, invoiceRef, clientEmail: recipient, status: 'sent' }
}

const SCAN_COLUMNS = 'id, user_id, company_id, client_id, series, invoice_number, issue_date, due_date, total, amount_paid, prepaid_amount, status, reminder_sent_at, notes, invoice_type_code, exchange_rate, subtotal, invoice_items(quantity, unit_price, tva_rate, total)'
const SCAN_FALLBACK_COLUMNS = 'id, user_id, company_id, client_id, series, invoice_number, issue_date, due_date, total, status'

export async function runDueReminders(options: { dryRun?: boolean } = {}) {
  const today = calendarDateInBucharest(0)
  // Widest window any schedule can reach: 3 days before due … 90 days after.
  const from = calendarDateInBucharest(-92)
  const to = calendarDateInBucharest(3)
  const scan = (columns: string) => supabase
    .from('invoices')
    .select(columns)
    .gte('due_date', from)
    .lte('due_date', to)
    .in('status', [...OPEN_INVOICE_STATUSES])
  const first = await scan(SCAN_COLUMNS)
  let invoices: any[] | null = first.data
  let error = first.error
  if (error) {
    const fallback = await scan(SCAN_FALLBACK_COLUMNS)
    invoices = fallback.data
    error = fallback.error
  }
  if (error) {
    throw new Error(error.message)
  }

  const candidates = (invoices || []).filter((inv: any) => !isPurchaseInvoice(inv) && inv.invoice_type_code !== '381' && inv.client_id)
  const clientIds = [...new Set(candidates.map((inv: any) => inv.client_id as string))]
  const invoiceIds = candidates.map((inv: any) => inv.id as string)

  const settingsByClient: Record<string, ReminderSettings> = {}
  const sentByInvoice: Record<string, number[]> = {}
  for (let i = 0; i < clientIds.length; i += 200) {
    const { data } = await supabase
      .from('client_reminder_settings')
      .select('client_id, enabled, offsets, recipient_email')
      .in('client_id', clientIds.slice(i, i + 200))
    for (const row of data || []) settingsByClient[row.client_id] = row as ReminderSettings
  }
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const { data } = await supabase
      .from('invoice_reminder_log')
      .select('invoice_id, offset_days')
      .eq('kind', 'auto')
      .in('invoice_id', invoiceIds.slice(i, i + 200))
    for (const row of data || []) {
      if (row.offset_days === null) continue
      ;(sentByInvoice[row.invoice_id] ||= []).push(row.offset_days)
    }
  }

  const results: ReminderResult[] = []
  for (const invoice of candidates) {
    const settings = effectiveSettings(invoice.client_id, settingsByClient[invoice.client_id])
    // Legacy clients (no settings row): a single reminder, skipped if anything was already sent.
    if (!settings.custom && invoice.reminder_sent_at) continue
    const offset = dueOffset(invoice.due_date || invoice.issue_date, today, settings, sentByInvoice[invoice.id] || [])
    if (offset === null) continue
    const converted = await ensureConvertedInvoiceAmounts(supabase, invoice)
    if (converted.amount_paid !== undefined && remainingOf(converted) < 0.01) continue

    const invoiceRef = `${invoice.series}${invoice.invoice_number}`
    if (options.dryRun) {
      results.push({ invoiceId: invoice.id, invoiceRef, status: 'skipped', reason: `dry-run (offset ${offset})` })
      continue
    }
    results.push(await sendInvoiceReminder(converted, { offsetDays: offset, recipient: settings.recipient_email }))
  }

  return {
    today,
    dryRun: !!options.dryRun,
    scanned: (invoices || []).length,
    results
  }
}
