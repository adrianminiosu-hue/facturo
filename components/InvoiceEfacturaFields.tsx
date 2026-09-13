'use client'
import { INVOICE_TYPE_CODES, PAYMENT_MEANS_CODES } from '@/lib/efactura'

export type InvoiceEfacturaValue = {
  invoice_type_code: string
  currency: string
  payment_means_code: string
  delivery_date: string
  buyer_reference: string
  order_reference: string
  period_start: string
  period_end: string
}

export default function InvoiceEfacturaFields({
  value,
  onChange
}: {
  value: InvoiceEfacturaValue
  onChange: (next: InvoiceEfacturaValue) => void
}) {
  return (
    <div className="card p-6">
      <h3 className="font-bold text-[color:var(--color-foreground)] mb-1">Date e-Factura (SPV)</h3>
      <p className="text-xs text-[color:var(--color-muted-foreground)] mb-4">
        Câmpuri necesare pentru XML RO_CIUS / UBL 2.1. Completarea lor permite trimiterea ulterioară în Spațiul Privat Virtual.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tip document</label>
          <select
            value={value.invoice_type_code}
            onChange={e => onChange({ ...value, invoice_type_code: e.target.value })}
            className="input bg-white"
          >
            {INVOICE_TYPE_CODES.map(type => (
              <option key={type.code} value={type.code}>{type.code} — {type.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monedă</label>
          <select
            value={value.currency}
            onChange={e => onChange({ ...value, currency: e.target.value })}
            className="input bg-white"
          >
            <option value="RON">RON</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Modalitate de plată</label>
          <select
            value={value.payment_means_code}
            onChange={e => onChange({ ...value, payment_means_code: e.target.value })}
            className="input bg-white"
          >
            {PAYMENT_MEANS_CODES.map(method => (
              <option key={method.code} value={method.code}>{method.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data livrării</label>
          <input
            type="date"
            value={value.delivery_date}
            onChange={e => onChange({ ...value, delivery_date: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Referință comandă</label>
          <input
            type="text"
            value={value.order_reference}
            onChange={e => onChange({ ...value, order_reference: e.target.value })}
            className="input"
            placeholder="PO-2026-001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Referință cumpărător</label>
          <input
            type="text"
            value={value.buyer_reference}
            onChange={e => onChange({ ...value, buyer_reference: e.target.value })}
            className="input"
            placeholder="Obligatoriu pentru autorități publice"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Perioadă facturare — de la</label>
          <input
            type="date"
            value={value.period_start}
            onChange={e => onChange({ ...value, period_start: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Perioadă facturare — până la</label>
          <input
            type="date"
            value={value.period_end}
            onChange={e => onChange({ ...value, period_end: e.target.value })}
            className="input"
          />
        </div>
      </div>
    </div>
  )
}
