'use client'
import { useLocale } from '@/components/LocaleProvider'
import { formatRoDate } from '@/lib/dates'
import type { AnafStatus } from '@/lib/anafStatus'

/** Red pill for inactive / struck-off, then one neutral pill: Activ la ANAF · plătitor TVA · … */
export default function AnafStatusBadges({ status, vatRegistered, publicInstitution, compact }: {
  status: AnafStatus | null
  vatRegistered?: boolean | null
  publicInstitution?: boolean | null
  /** Only the red risk pill (lists). */
  compact?: boolean
}) {
  const { t } = useLocale()
  const risk = status?.deregistered_on
    ? t('cc.anafDeregistered', { date: formatRoDate(status.deregistered_on) })
    : status?.inactive ? t('cc.anafInactive') : ''
  const parts = [
    status && !risk ? t('cc.anafActive') : '',
    vatRegistered === false ? t('cc.vatNonPayer') : t('cc.vatPayer'),
    status?.vat_on_collection ? t('cc.vatOnCollection') : '',
    status?.split_vat ? t('cc.splitVat') : '',
    status?.efactura_registered ? t('cc.efacturaRegistered') : '',
    publicInstitution ? t('cc.publicInstitution') : ''
  ].filter(Boolean)
  const checked = status?.checked_at ? t('cc.anafChecked', { date: formatRoDate(status.checked_at.slice(0, 10)) }) : t('cc.anafNotChecked')

  return (
    <>
      {risk && (
        <span className="inline-block text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-full px-2.5 py-1" title={checked}>{risk}</span>
      )}
      {!compact && (
        <span className="inline-block text-xs font-medium text-[color:var(--color-muted-foreground)] border border-gray-200 rounded-full px-2.5 py-1" title={checked}>
          {parts.join(' · ')}
        </span>
      )}
    </>
  )
}
