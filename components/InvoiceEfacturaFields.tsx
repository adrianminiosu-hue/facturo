'use client'
import Chevron from '@/components/Chevron'
import DateField from '@/components/DateField'
import { useEffect, useState } from 'react'
import { INVOICE_TYPE_CODES, PAYMENT_MEANS_CODES } from '@/lib/efactura'
import { useLocale } from '@/components/LocaleProvider'
import { invoiceTypeKey, paymentMeansKey } from '@/lib/uiLabels'

export type InvoiceEfacturaValue = {
  invoice_type_code: string
  currency: string
  payment_means_code: string
  tax_point_date: string
  delivery_date: string
  buyer_reference: string
  order_reference: string
  period_start: string
  period_end: string
}

export default function InvoiceEfacturaFields({
  value,
  onChange,
  buyerIsPublic,
  lockType
}: {
  value: InvoiceEfacturaValue
  onChange: (next: InvoiceEfacturaValue) => void
  buyerIsPublic?: boolean
  lockType?: boolean
}) {
  const { t } = useLocale()
  const hasExtra = Boolean(
    value.order_reference ||
    value.buyer_reference ||
    value.period_start ||
    value.period_end
  )
  const [open, setOpen] = useState(hasExtra || !!buyerIsPublic)
  const types = lockType
    ? INVOICE_TYPE_CODES.filter(type => type.code === value.invoice_type_code)
    : INVOICE_TYPE_CODES.filter(type => type.code !== '381' || value.invoice_type_code === '381')

  useEffect(() => {
    if (buyerIsPublic || hasExtra) setOpen(true)
  }, [buyerIsPublic, hasExtra])

  return (
    <div className="card p-6">
      <h3 className="font-bold text-[color:var(--color-foreground)] mb-1">{t('inv.efacturaFields')}</h3>
      <p className="text-xs text-[color:var(--color-muted-foreground)] mb-4">
        {t('inv.efacturaFieldsLead')}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.docType')}</label>
          <select
            value={value.invoice_type_code}
            onChange={e => onChange({ ...value, invoice_type_code: e.target.value })}
            className="input bg-white"
            disabled={lockType}
          >
            {types.map(type => (
              <option key={type.code} value={type.code}>{type.code} — {t(invoiceTypeKey(type.code))}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.currency')}</label>
          <input type="text" value="RON" readOnly className="input bg-gray-50 text-gray-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.paymentMeans')}</label>
          <select
            value={value.payment_means_code}
            onChange={e => onChange({ ...value, payment_means_code: e.target.value })}
            className="input bg-white"
          >
            {PAYMENT_MEANS_CODES.map(method => (
              <option key={method.code} value={method.code}>{paymentMeansKey(method.code) ? t(paymentMeansKey(method.code)!) : method.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.vatDate')}</label>
          <DateField
            value={value.tax_point_date}
            onChange={e => onChange({ ...value, tax_point_date: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.deliveryDate')}</label>
          <DateField
            value={value.delivery_date}
            onChange={e => onChange({ ...value, delivery_date: e.target.value })}
            className="input"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="mt-4 text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] inline-flex items-center gap-1.5"
        aria-expanded={open}
      >
        <Chevron right={!open} />
        {t('inv.moreDetails')}
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.periodFrom')}</label>
            <DateField
              value={value.period_start}
              onChange={e => onChange({ ...value, period_start: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.periodTo')}</label>
            <DateField
              value={value.period_end}
              onChange={e => onChange({ ...value, period_end: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv.orderRef')}</label>
            <input
              type="text"
              value={value.order_reference}
              onChange={e => onChange({ ...value, order_reference: e.target.value })}
              className="input"
              placeholder="PO-2026-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('inv.buyerRef')} {buyerIsPublic ? '*' : ''}
            </label>
            <input
              type="text"
              value={value.buyer_reference}
              onChange={e => onChange({ ...value, buyer_reference: e.target.value })}
              className="input"
              placeholder={t('inv.buyerRefPh')}
            />
            {buyerIsPublic && !value.buyer_reference && (
              <p className="text-red-500 text-xs mt-1">{t('inv.buyerRefRequired')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
