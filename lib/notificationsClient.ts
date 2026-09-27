'use client'
import { calendarDateInBucharest, addDaysIso } from '@/lib/dates'
import { getCurrentUser, supabase } from '@/lib/supabase'
import { loadEfacturaConnection } from '@/lib/invoiceClient'
import {
  buildNotifications,
  FEED_DAYS,
  type NotificationBankEvent,
  type NotificationInvoice,
  type NotificationPayment,
  type NotificationReminder
} from '@/lib/notifications'

const INVOICE_COLUMNS: string = 'id, series, invoice_number, issue_date, due_date, created_at, status, notes, direction, invoice_type_code, total, subtotal, amount_paid, prepaid_amount, exchange_rate, currency, efactura_status, efactura_error, efactura_uploaded_at, efactura_index, invoice_items(quantity, unit_price, tva_rate, total), clients(company_name, cui, country)'
/** Short cache so the bell in the header and the page share one load while you move between pages. */
const CACHE_MS = 60_000

type Built = ReturnType<typeof buildNotifications>
const cache = new Map<string, { at: number; value: Promise<Built> }>()
const listeners = new Set<() => void>()

async function load(companyId: string, ownerUserId: string, userId: string): Promise<Built> {
  const since = addDaysIso(calendarDateInBucharest(0), -FEED_DAYS - 1)
  const [invoices, payments, reminders, bank, connection] = await Promise.all([
    supabase.from('invoices').select(INVOICE_COLUMNS).eq('company_id', companyId),
    supabase.from('invoice_payments').select('id, invoice_id, amount, paid_on, created_at, source').eq('company_id', companyId).gte('paid_on', since),
    supabase.from('invoice_reminder_log').select('id, invoice_id, kind, recipient, sent_at').eq('user_id', ownerUserId).gte('sent_at', since),
    supabase.from('bank_match_events').select('id, created_at, payload').eq('company_id', companyId).eq('action', 'import').gte('created_at', since),
    loadEfacturaConnection(userId, ownerUserId).catch(() => null)
  ])
  if (invoices.error) throw new Error(invoices.error.message)
  return buildNotifications({
    invoices: (invoices.data || []) as unknown as NotificationInvoice[],
    // The optional sources may not exist yet on older databases: an error there just means "nothing to report".
    payments: (payments.error ? [] : payments.data || []) as NotificationPayment[],
    reminders: (reminders.error ? [] : reminders.data || []) as NotificationReminder[],
    bankImports: (bank.error ? [] : bank.data || []) as NotificationBankEvent[],
    tokenExpiresAt: connection?.connected ? connection.expiresAt || null : null
  }, { today: calendarDateInBucharest(0) })
}

export function loadNotifications(companyId: string, ownerUserId: string, userId: string, fresh = false) {
  const key = `${companyId}:${userId}`
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const value = load(companyId, ownerUserId, userId)
  cache.set(key, { at: Date.now(), value })
  value.catch(() => cache.delete(key))
  return value
}

/** When this user last opened the notifications, kept on the user so every device agrees. */
export async function notificationsSeenAt(): Promise<string | null> {
  const { data } = await getCurrentUser()
  return (data.user?.user_metadata?.notifications_seen_at as string | undefined) || null
}

export async function markNotificationsSeen(at = new Date().toISOString()) {
  await supabase.auth.updateUser({ data: { notifications_seen_at: at } })
  for (const listener of listeners) listener()
}

/** The header bell listens, so its count clears as soon as the page marks everything seen. */
export function onNotificationsSeen(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
