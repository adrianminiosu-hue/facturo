'use client'
import { useLocale } from '@/components/LocaleProvider'

export type LandingDevice = 'desktop' | 'mobile'

export default function DeviceSwitch({
  value,
  onChange
}: {
  value: LandingDevice
  onChange: (next: LandingDevice) => void
}) {
  const { t } = useLocale()

  return (
    <div className="landing-device-switch" role="group" aria-label={t('landing.device')}>
      <span className="landing-device-thumb" data-side={value} aria-hidden="true" />
      <button
        type="button"
        data-active={value === 'desktop'}
        aria-pressed={value === 'desktop'}
        onClick={() => onChange('desktop')}
      >
        {t('landing.desktop')}
      </button>
      <button
        type="button"
        data-active={value === 'mobile'}
        aria-pressed={value === 'mobile'}
        onClick={() => onChange('mobile')}
      >
        {t('landing.mobile')}
      </button>
    </div>
  )
}
