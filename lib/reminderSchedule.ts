import { addDaysIso, daysBetween } from '@/lib/dates'

/** Days relative to the due date: negative = before, positive = after. */
export const REMINDER_OFFSET_CHOICES = [-3, -2, 1, 7, 15, 30] as const
export const LEGACY_OFFSETS = [-2]
export const RECOMMENDED_OFFSETS = [-3, 1, 7, 15, 30]
/** From this offset on, the email is worded as a formal notice (somație). */
export const FORMAL_NOTICE_OFFSET = 30
/** A missed cron run still sends the reminder if it is at most this many days late. */
export const CATCH_UP_DAYS = 2

export type ReminderSettings = {
  client_id: string
  enabled: boolean
  offsets: number[]
  recipient_email?: string | null
}

export type ReminderLogEntry = {
  invoice_id: string
  offset_days: number | null
  kind: 'auto' | 'manual'
  sent_at: string
}

export function normalizeOffsets(offsets: unknown): number[] {
  if (!Array.isArray(offsets)) return []
  const clean = offsets
    .map(v => Number(v))
    .filter(v => Number.isInteger(v) && v >= -30 && v <= 90)
  return [...new Set(clean)].sort((a, b) => a - b)
}

/** Settings in force for a client: its own row, or the legacy default. */
export function effectiveSettings(clientId: string, row?: Partial<ReminderSettings> | null): ReminderSettings & { custom: boolean } {
  if (!row) return { client_id: clientId, enabled: true, offsets: LEGACY_OFFSETS, recipient_email: null, custom: false }
  return {
    client_id: clientId,
    enabled: row.enabled !== false,
    offsets: normalizeOffsets(row.offsets),
    recipient_email: row.recipient_email || null,
    custom: true
  }
}

export function offsetLabel(offset: number) {
  return offset > 0 ? `+${offset}` : offset < 0 ? `−${Math.abs(offset)}` : '0'
}

/** Offset due today for an invoice, or null. Picks the latest configured step not yet sent. */
export function dueOffset(
  dueDate: string,
  today: string,
  settings: Pick<ReminderSettings, 'enabled' | 'offsets'>,
  alreadySent: number[]
): number | null {
  if (!settings.enabled) return null
  const current = daysBetween(dueDate, today)
  const candidates = settings.offsets
    .filter(o => o <= current && current - o <= CATCH_UP_DAYS && !alreadySent.includes(o))
    .sort((a, b) => b - a)
  if (!candidates.length) return null
  // Never send an older step after a newer one went out.
  const latestSent = alreadySent.length ? Math.max(...alreadySent) : -Infinity
  return candidates[0] > latestSent ? candidates[0] : null
}

/** Next reminder that the scheduler will send for an open invoice. */
export function nextScheduled(
  dueDate: string,
  today: string,
  settings: Pick<ReminderSettings, 'enabled' | 'offsets'>,
  alreadySent: number[]
): { offset: number; date: string } | null {
  if (!settings.enabled) return null
  const current = daysBetween(dueDate, today)
  const latestSent = alreadySent.length ? Math.max(...alreadySent) : -Infinity
  const next = settings.offsets
    .filter(o => o >= current && o > latestSent && !alreadySent.includes(o))
    .sort((a, b) => a - b)[0]
  if (next === undefined) return null
  return { offset: next, date: addDaysIso(dueDate, next) }
}
