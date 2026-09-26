'use client'
import { useLocale } from '@/components/LocaleProvider'
import { formatLandingLei, landingDemo } from '@/components/landing/PhoneMock'
import { BRAND } from '@/lib/brand'

export default function DesktopMock() {
  const { t } = useLocale()

  return (
    <div className="landing-desk">
      <div className="landing-desk-bar" aria-hidden="true">
        <span className="landing-desk-dots">
          <span />
          <span />
          <span />
        </span>
        <span>{BRAND.name.toLowerCase()}</span>
      </div>
      <div className="landing-desk-body">
        <div className="landing-desk-rail" aria-hidden="true">
          <span data-on="true" />
          <span />
          <span />
          <span />
        </div>
        <div className="landing-desk-main">
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
      </div>
    </div>
  )
}
