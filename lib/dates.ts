export const DEFAULT_DUE_DAYS = 15

export function addDaysIso(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function defaultDueDate(issueDate: string, days = DEFAULT_DUE_DAYS) {
  return addDaysIso(issueDate, days)
}

/** 1 = Monday … 7 = Sunday (ISO), for a YYYY-MM-DD calendar date. */
export function isoWeekday(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return 1
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return dow === 0 ? 7 : dow
}

export function startOfIsoWeek(isoDate: string) {
  return addDaysIso(isoDate, 1 - isoWeekday(isoDate))
}

export function calendarDateInBucharest(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const year = Number(parts.find(p => p.type === 'year')?.value)
  const month = Number(parts.find(p => p.type === 'month')?.value)
  const day = Number(parts.find(p => p.type === 'day')?.value)
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays))
  return date.toISOString().slice(0, 10)
}

export function formatRoDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}.${month}.${year}`
}

export function daysUntilDue(dueIso: string, todayIso = calendarDateInBucharest(0)) {
  const due = Date.parse(`${dueIso}T12:00:00Z`)
  const today = Date.parse(`${todayIso}T12:00:00Z`)
  if (Number.isNaN(due) || Number.isNaN(today)) return 0
  return Math.round((due - today) / 86400000)
}

export type AgingKey = 'due_0_2' | 'due_week' | 'overdue_1_30' | 'overdue_30' | 'later'

export function agingKey(daysUntil: number): AgingKey {
  if (daysUntil < -30) return 'overdue_30'
  if (daysUntil < 0) return 'overdue_1_30'
  if (daysUntil <= 2) return 'due_0_2'
  if (daysUntil <= 7) return 'due_week'
  return 'later'
}
