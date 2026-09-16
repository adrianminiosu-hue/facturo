'use client'
import { UNIT_CODES, VAT_CATEGORIES, vatCategoryFromRate } from '@/lib/efactura'
import { formatAmount } from '@/lib/money'

export type InvoiceLineItem = {
  id?: string
  description: string
  quantity: number
  unit_price: number
  tva_rate: number
  total: number
  unit_code: string
  vat_category: string
  vat_exemption_reason: string
}

export const emptyInvoiceLine = (): InvoiceLineItem => ({
  description: '',
  quantity: 1,
  unit_price: 0,
  tva_rate: 21,
  total: 0,
  unit_code: 'H87',
  vat_category: 'S',
  vat_exemption_reason: ''
})

export default function InvoiceLineItems({
  items,
  onChange
}: {
  items: InvoiceLineItem[]
  onChange: (items: InvoiceLineItem[]) => void
}) {
  const updateItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    if (field === 'tva_rate') {
      updated[index].vat_category = vatCategoryFromRate(Number(value), updated[index].vat_category)
      if (Number(value) > 0) updated[index].vat_exemption_reason = ''
    }
    const item = updated[index]
    const subtotal = item.quantity * item.unit_price
    updated[index].total = subtotal + (subtotal * item.tva_rate / 100)
    onChange(updated)
  }

  const addItem = () => onChange([...items, emptyInvoiceLine()])
  const removeItem = (index: number) => {
    if (items.length === 1) return
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="card p-6">
      <h3 className="font-bold text-[color:var(--color-foreground)] mb-4">Produse / Servicii</h3>
      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="border border-gray-100 rounded-xl p-3">
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-4">
                {index === 0 && <label className="block text-xs text-gray-500 mb-1">Descriere</label>}
                <input
                  type="text"
                  value={item.description}
                  onChange={e => updateItem(index, 'description', e.target.value)}
                  className="input px-3 py-2.5"
                  placeholder="Serviciu / produs"
                />
              </div>
              <div className="col-span-4 md:col-span-1">
                {index === 0 && <label className="block text-xs text-gray-500 mb-1">Cant.</label>}
                <input
                  type="number"
                  value={item.quantity}
                  onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                  className="input px-3 py-2.5"
                  min="0"
                />
              </div>
              <div className="col-span-8 md:col-span-2">
                {index === 0 && <label className="block text-xs text-gray-500 mb-1">UM</label>}
                <select
                  value={item.unit_code}
                  onChange={e => updateItem(index, 'unit_code', e.target.value)}
                  className="input bg-white px-3 py-2.5"
                >
                  {UNIT_CODES.map(unit => (
                    <option key={unit.code} value={unit.code}>{unit.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-4 md:col-span-2">
                {index === 0 && <label className="block text-xs text-gray-500 mb-1">Preț unitar</label>}
                <input
                  type="number"
                  value={item.unit_price}
                  onChange={e => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                  className="input px-3 py-2.5"
                  min="0"
                />
              </div>
              <div className="col-span-4 md:col-span-2">
                {index === 0 && <label className="block text-xs text-gray-500 mb-1">TVA %</label>}
                <select
                  value={item.tva_rate}
                  onChange={e => updateItem(index, 'tva_rate', parseFloat(e.target.value))}
                  className="input bg-white px-3 py-2.5"
                >
                  <option value={21}>21%</option>
                  <option value={9}>9%</option>
                  <option value={5}>5%</option>
                  <option value={0}>0%</option>
                </select>
              </div>
              <div className="col-span-3 md:col-span-1">
                {index === 0 && <label className="block text-xs text-gray-500 mb-1">Total</label>}
                <p className="text-sm font-medium text-[color:var(--color-foreground)] py-2.5">{formatAmount(item.total)}</p>
              </div>
              <div className="col-span-1">
                {index === 0 && <div className="mb-1 h-4"></div>}
                <button
                  onClick={() => removeItem(index)}
                  className="text-red-400 hover:text-red-600 transition text-lg leading-none py-2.5"
                >
                  ×
                </button>
              </div>
            </div>
            {item.tva_rate === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                <select
                  value={item.vat_category}
                  onChange={e => updateItem(index, 'vat_category', e.target.value)}
                  className="input bg-white px-3 py-2.5"
                >
                  {VAT_CATEGORIES.filter(cat => cat.code !== 'S').map(cat => (
                    <option key={cat.code} value={cat.code}>{cat.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={item.vat_exemption_reason}
                  onChange={e => updateItem(index, 'vat_exemption_reason', e.target.value)}
                  className="input px-3 py-2.5"
                  placeholder="Motiv scutire TVA (obligatoriu pentru E/AE/K/G/O)"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={addItem} className="mt-4 btn btn-outline w-full border-dashed">
        + Adaugă linie
      </button>
    </div>
  )
}
