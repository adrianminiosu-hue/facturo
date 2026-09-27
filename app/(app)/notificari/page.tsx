'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppNav from '@/components/AppNav'
import Money from '@/components/Money'
import { useCompany } from '@/components/CompanyProvider'
import { useLocale } from '@/components/LocaleProvider'
import { getCurrentUser } from '@/lib/supabase'
import { addDaysIso, calendarDateInBucharest, formatRoDate } from '@/lib/dates'
import { countWord } from '@/lib/i18n'
import { isUnread, unreadCount, type NotificationCategory, type NotificationItem, type NotificationTone, type UpcomingItem } from '@/lib/notifications'
import { loadNotifications, markNotificationsSeen, notificationsSeenAt } from '@/lib/notificationsClient'

type Filter = 'all' | NotificationCategory
const FILTERS: Filter[] = ['all', 'receivables', 'suppliers', 'efactura', 'bank']
const REFS_SHOWN = 6

const TONE_DOT: Record<NotificationTone, string> = {
  good: 'bg-green-600',
  bad: 'bg-red-500',
  warn: 'bg-amber-500',
  neutral: 'bg-[color:var(--color-muted-foreground)]'
}

export default function NotificationsPage() {
  const router = useRouter()
  const { t, locale } = useLocale()
  const { userId, ownerUserId, company, loading: companyLoading } = useCompany()
  const [feed, setFeed] = useState<NotificationItem[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([])
  /** When the user had last looked, before this visit: decides what is shown as new. */
  const [seenBefore, setSeenBefore] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const n = (value: number) => countWord(value, locale)

  useEffect(() => {
    const init = async () => {
      if (companyLoading || !userId) return
      const { data: { user } } = await getCurrentUser()
      if (!user) {
        router.push('/login')
        return
      }
      if (!company?.id) {
        setLoading(false)
        return
      }
      try {
        const [built, seen] = await Promise.all([
          loadNotifications(company.id, ownerUserId || userId, userId, true),
          notificationsSeenAt()
        ])
        setFeed(built.feed)
        setUpcoming(built.upcoming)
        setSeenBefore(seen)
        await markNotificationsSeen()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
      setLoading(false)
    }
    init()
  }, [companyLoading, userId, ownerUserId, company?.id])

  const today = calendarDateInBucharest(0)
  const newCount = unreadCount(feed, seenBefore)
  const visible = feed.filter(item => (filter === 'all' || item.category === filter) && (!unreadOnly || isUnread(item, seenBefore)))
  const days = useMemo(() => {
    const out: Array<{ day: string; items: NotificationItem[] }> = []
    for (const item of visible) {
      const last = out[out.length - 1]
      if (last && last.day === item.day) last.items.push(item)
      else out.push({ day: item.day, items: [item] })
    }
    return out
  }, [visible])
  const upcomingVisible = upcoming.filter(item => filter === 'all' || item.category === filter)

  const dayLabel = (day: string) => {
    if (day === today) return t('ntf.today')
    if (day === addDaysIso(today, -1)) return t('ntf.yesterday')
    if (day === addDaysIso(today, 1)) return t('ntf.tomorrow')
    const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ro-RO', { weekday: 'long', timeZone: 'UTC' })
    return `${weekday}, ${formatRoDate(day)}`
  }

  const text = (item: NotificationItem | UpcomingItem) => {
    const first = item.refs[0]
    const vars: Record<string, string | number> = {
      ...item.vars,
      ref: first?.label || '',
      party: first?.party || '—'
    }
    for (const key of ['count', 'days', 'lines', 'auto', 'toConfirm']) {
      if (typeof item.vars[key] === 'number') vars[key] = n(item.vars[key] as number)
    }
    return t(item.key, vars)
  }

  const refsLine = (item: NotificationItem | UpcomingItem) => {
    if (item.refs.length < 2) return null
    return (
      <p className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[color:var(--color-muted-foreground)]">
        {item.refs.slice(0, REFS_SHOWN).map(ref => (
          <Link key={ref.href + ref.label} href={ref.href} className="underline underline-offset-2">
            {ref.label}{ref.party ? ` · ${ref.party}` : ''}
          </Link>
        ))}
        {item.refs.length > REFS_SHOWN && <span>+{item.refs.length - REFS_SHOWN}</span>}
      </p>
    )
  }

  const row = (item: NotificationItem | UpcomingItem, unread: boolean) => {
    const single = item.refs.length === 1 ? item.refs[0] : null
    const bank = 'vars' in item && item.vars.source === 'bank'
    return (
      <div className="py-3 flex items-start gap-3">
        <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${TONE_DOT[item.tone]}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${unread ? 'font-semibold' : ''}`}>
            {single ? <Link href={single.href} className="hover:underline">{text(item)}</Link> : text(item)}
            {bank && <span className="ml-1.5 text-xs font-normal text-[color:var(--color-muted-foreground)]">({t('ntf.src.bank')})</span>}
            {unread && <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-[color:var(--color-foreground)] text-[color:var(--color-background)] align-middle">{t('ntf.new')}</span>}
          </p>
          {refsLine(item)}
        </div>
        {item.amount ? <span className="text-sm whitespace-nowrap"><Money value={item.amount} /></span> : null}
        {item.action && (
          <Link href={item.action.href} className="btn btn-outline text-xs whitespace-nowrap">{t(item.action.key)}</Link>
        )}
      </div>
    )
  }

  if (loading || companyLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppNav active="notifications" />
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="page-toolbar">
          <div>
            <h2 className="page-title">{t('ntf.title')}</h2>
            <p className="text-[color:var(--color-muted-foreground)] mt-1">
              {newCount === 0 ? t('ntf.allRead') : newCount === 1 ? t('ntf.newOne') : t('ntf.newMany', { count: n(newCount) })}
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{error}</p>}

        <div className="card p-5 mb-4">
          <h3 className="font-semibold mb-1">{t('ntf.upcoming')}</h3>
          {upcomingVisible.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">{t('ntf.upcomingEmpty')}</p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {upcomingVisible.map(item => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="text-xs font-medium w-24 shrink-0 pt-3.5 text-[color:var(--color-muted-foreground)] capitalize">{dayLabel(item.date)}</span>
                  <div className="flex-1 min-w-0">{row(item, false)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FILTERS.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`text-xs px-2.5 py-1 rounded-lg border ${filter === key ? 'bg-[color:var(--color-foreground)] text-[color:var(--color-background)] border-transparent' : 'border-[color:var(--color-border)]'}`}
            >
              {t(`ntf.filter.${key}`)}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
            {t('ntf.unreadOnly')}
          </label>
        </div>

        <div className="card p-5">
          {days.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)] py-4 text-center">{t('ntf.empty')}</p>
          ) : (
            days.map(group => (
              <section key={group.day} className="mb-4 last:mb-0">
                <h4 className="kicker mt-2 first:mt-0 capitalize">{dayLabel(group.day)}</h4>
                <ul className="divide-y divide-[color:var(--color-border)]">
                  {group.items.map(item => <li key={item.id}>{row(item, isUnread(item, seenBefore))}</li>)}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
