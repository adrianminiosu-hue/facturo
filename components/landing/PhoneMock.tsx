'use client'
import { useLocale } from '@/components/LocaleProvider'

export const landingDemo = {
  openLei: 186450,
  clientCount: 9,
  weekLei: 60300,
  lateName: 'Exemplu Construct',
  lateLei: 12100,
  lateDays: 6,
  paidName: 'Piatra Consult',
  paidLei: 18150,
  soonName: 'Atelier Nord',
  soonLei: 24200,
  soonDays: 3
}

export function formatLandingLei(value: number, signed = false) {
  const abs = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(Math.abs(value))
  if (!signed) return `${abs} lei`
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${abs} lei`
}

export default function PhoneMock() {
  const { t } = useLocale()

  return (
    <div className="landing-phone">
      <div className="landing-device-bar" aria-hidden="true">
        <span>09:41</span>
        <span className="landing-device-nodes">
          <span />
          <span />
          <span />
        </span>
      </div>
      <p className="landing-phone-date">{t('landing.phone.date')}</p>
      <p className="landing-phone-kicker">{t('landing.phone.open')}</p>
      <p className="landing-phone-total">{formatLandingLei(landingDemo.openLei)}</p>
      <p className="landing-phone-sub">{t('landing.phone.fromClients', { count: landingDemo.clientCount })}</p>
      <p className="landing-week">
        {t('landing.phone.week')} {formatLandingLei(landingDemo.weekLei)}
      </p>
      <div className="landing-late">
        <p>
          {t('landing.phone.late', {
            name: landingDemo.lateName,
            amount: formatLandingLei(landingDemo.lateLei),
            days: landingDemo.lateDays
          })}
        </p>
        <button type="button" className="landing-late-btn">
          {t('landing.phone.nudge')}
        </button>
      </div>
      <p className="landing-paid">
        {t('landing.phone.paid', {
          name: landingDemo.paidName,
          amount: formatLandingLei(landingDemo.paidLei, true)
        })}
      </p>
      <p className="landing-soon">
        {t('landing.phone.soon', {
          name: landingDemo.soonName,
          days: landingDemo.soonDays,
          amount: formatLandingLei(landingDemo.soonLei)
        })}
      </p>
    </div>
  )
}
