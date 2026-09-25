'use client'
import Link from 'next/link'
import { useLocale } from '@/components/LocaleProvider'

export default function ReceivablesTabs({ active }: { active: 'clients' | 'invoices' }) {
  const { t } = useLocale()
  const cls = (on: boolean) =>
    `text-sm font-medium px-4 py-2 rounded-lg transition ${on
      ? 'bg-[color:var(--color-card)] text-[color:var(--color-foreground)] shadow-sm'
      : 'text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]'}`
  return (
    <nav aria-label={t('rec.title')} className="inline-flex gap-1 p-1 rounded-xl bg-[color:var(--color-muted)] mb-6">
      <Link href="/incasari/clienti" className={cls(active === 'clients')} aria-current={active === 'clients' ? 'page' : undefined}>
        {t('cc.tabClients')}
      </Link>
      <Link href="/incasari" className={cls(active === 'invoices')} aria-current={active === 'invoices' ? 'page' : undefined}>
        {t('cc.tabInvoices')}
      </Link>
    </nav>
  )
}
