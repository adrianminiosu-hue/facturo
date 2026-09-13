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
