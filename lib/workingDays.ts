import { addDaysIso, isoWeekday } from '@/lib/dates'

/**
 * Romanian working days (Codul muncii, art. 139): weekends and legal holidays are not working days.
 * Used for the e-Factura deadline: 5 working days from the issue date.
 */

/** Orthodox Easter Sunday (Gregorian calendar date), valid 1900–2099. */
export function orthodoxEaster(year: number) {
  const a = year % 4
  const b = year % 7
  const c = year % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7
  const month = Math.floor((d + e + 114) / 31)
  const day = ((d + e + 114) % 31) + 1
  // Julian → Gregorian: +13 days in 1900–2099.
  const julian = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return addDaysIso(julian, 13)
}

const FIXED = [
  '01-01', '01-02', // Anul Nou
  '01-06', '01-07', // Boboteaza, Sf. Ioan
  '01-24', // Unirea Principatelor
  '05-01', // Ziua Muncii
  '06-01', // Ziua Copilului
  '08-15', // Adormirea Maicii Domnului
  '11-30', // Sf. Andrei
  '12-01', // Ziua Națională
  '12-25', '12-26' // Crăciunul
]

const cache = new Map<number, Set<string>>()

export function romanianHolidays(year: number) {
  const hit = cache.get(year)
  if (hit) return hit
  const easter = orthodoxEaster(year)
  const days = new Set<string>([
    ...FIXED.map(md => `${year}-${md}`),
    addDaysIso(easter, -2), // Vinerea Mare
    easter,
    addDaysIso(easter, 1),
    addDaysIso(easter, 49), // Rusalii
    addDaysIso(easter, 50)
  ])
  cache.set(year, days)
  return days
}

export function isWorkingDay(isoDate: string) {
  if (isoWeekday(isoDate) >= 6) return false
  return !romanianHolidays(Number(isoDate.slice(0, 4))).has(isoDate)
}

/** The `count`-th working day after `isoDate` (the start day itself is not counted). */
export function addWorkingDays(isoDate: string, count: number) {
  let date = isoDate
  let left = count
  while (left > 0) {
    date = addDaysIso(date, 1)
    if (isWorkingDay(date)) left -= 1
  }
  return date
}

/**
 * Working days from `fromIso` to `toIso`: 0 when `toIso` is `fromIso`, positive ahead, negative when past.
 * A non-working `toIso` counts as the next working day before it is reached.
 */
export function workingDaysBetween(fromIso: string, toIso: string) {
  if (fromIso === toIso) return 0
  const forward = toIso > fromIso
  let date = fromIso
  let count = 0
  let guard = 0
  while (date !== toIso && guard < 4000) {
    date = addDaysIso(date, forward ? 1 : -1)
    if (isWorkingDay(date)) count += 1
    guard += 1
  }
  return forward ? count : -count
}

/** Legal deadline to upload an invoice to e-Factura: 5 working days after the issue date. */
export const EFACTURA_DEADLINE_WORKING_DAYS = 5

export function efacturaDeadline(issueDate: string) {
  return addWorkingDays(issueDate, EFACTURA_DEADLINE_WORKING_DAYS)
}
