'use client'
import { useLocale } from '@/components/LocaleProvider'
import { formatRoDate } from '@/lib/dates'
import type { PaymentBehaviour } from '@/lib/clientCollections'

const STYLE: Record<PaymentBehaviour, string> = {
  risk: 'bg-red-50 text-red-700',
  late: 'bg-amber-50 text-amber-800',
  promised: 'bg-blue-50 text-blue-800',
  on_time: 'bg-green-50 text-green-800',
  new: 'bg-gray-100 text-gray-700'
}

export default function PaymentBehaviourBadge({ behaviour, promise }: { behaviour: PaymentBehaviour; promise?: string | null }) {
  const { t } = useLocale()
  return (
    <span className={`inline-block whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${STYLE[behaviour]}`}>
      {t(`cc.b.${behaviour}`, { date: promise ? formatRoDate(promise).slice(0, 5) : '' })}
    </span>
  )
}
