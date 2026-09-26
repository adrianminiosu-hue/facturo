'use client'
import { formatRon } from '@/lib/money'
import type { computeInvoiceTotals } from '@/lib/invoiceMath'
import { useLocale } from '@/components/LocaleProvider'
import Money from '@/components/Money'

type Totals = ReturnType<typeof computeInvoiceTotals>

export default function InvoiceTotalsFields({
  totals,
  discountPercent,
  prepaidAmount,
  onDiscountPercent,
  onPrepaidAmount
}: {
  totals: Totals
  discountPercent: number
  prepaidAmount: number
  onDiscountPercent: (value: number) => void
  onPrepaidAmount: (value: number) => void
}) {
  const { t } = useLocale()
  return (
    <div className="card p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.docDiscount')}</label>
            <input
              type="number"
              min="0"
              max="100"
              value={discountPercent}
              onChange={e => onDiscountPercent(parseFloat(e.target.value) || 0)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.prepaid')}</label>
            <input
              type="number"
              min="0"
              value={prepaidAmount}
              onChange={e => onPrepaidAmount(parseFloat(e.target.value) || 0)}
              className="input"
            />
            <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
              {t('inv.prepaidHelp')}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex justify-between w-72">
            <span className="text-sm text-[color:var(--color-muted-foreground)]">{t('inv.lineBase')}</span>
            <span className="text-sm font-medium"><Money value={totals.lineExtension} /></span>
          </div>
          {totals.headerDiscount > 0 && (
            <div className="flex justify-between w-72">
              <span className="text-sm text-[color:var(--color-muted-foreground)]">Discount</span>
              <span className="text-sm font-medium">-{formatRon(totals.headerDiscount)}</span>
            </div>
          )}
          {totals.vatBreakdown.map(row => (
            <div key={row.rate} className="flex justify-between w-72">
              <span className="text-sm text-[color:var(--color-muted-foreground)]">
                {t('inv.vatOn', { rate: row.rate, base: formatRon(row.taxable) })}
              </span>
              <span className="text-sm font-medium"><Money value={row.tax} /></span>
            </div>
          ))}
          <div className="flex justify-between w-72">
            <span className="text-sm text-[color:var(--color-muted-foreground)]">{t('inv.totalWithVat')}</span>
            <span className="text-sm font-medium"><Money value={totals.taxInclusive} /></span>
          </div>
          {totals.prepaid > 0 && (
            <div className="flex justify-between w-72">
              <span className="text-sm text-[color:var(--color-muted-foreground)]">{t('inv.advance')}</span>
              <span className="text-sm font-medium">-{formatRon(totals.prepaid)}</span>
            </div>
          )}
          <div className="flex justify-between w-72 pt-2 border-t border-gray-100">
            <span className="font-bold text-[color:var(--color-foreground)]">{t('inv.payable')}</span>
            <span className="font-bold text-[color:var(--color-foreground)] text-lg"><Money value={totals.payable} /></span>
          </div>
        </div>
      </div>
    </div>
  )
}
