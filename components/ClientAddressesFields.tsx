'use client'
import RoAddressFields from '@/components/RoAddressFields'
import {
  CLIENT_ADDRESS_TYPES,
  addClientAddress,
  removeClientAddress,
  setDefaultAddress,
  type ClientAddressDraft
} from '@/lib/clientDirectory'

export default function ClientAddressesFields({
  addresses,
  onChange
}: {
  addresses: ClientAddressDraft[]
  onChange: (next: ClientAddressDraft[]) => void
}) {
  const update = (key: string, patch: Partial<ClientAddressDraft>) => {
    onChange(addresses.map(a => a.key === key ? { ...a, ...patch } : a))
  }

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wider">
            Adrese
          </p>
          <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">
            O singură adresă este implicită — aceasta este folosită pe factură și în e-Factura.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(addClientAddress(addresses))}
          className="btn btn-outline px-3 py-2 text-xs whitespace-nowrap"
        >
          + Adaugă adresă
        </button>
      </div>

      <div className="space-y-4">
        {addresses.map((row, index) => (
          <div key={row.key} className="border border-gray-100 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                Adresă {index + 1}
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)]">
                  <input
                    type="radio"
                    name="client-default-address"
                    checked={row.is_default}
                    onChange={() => onChange(setDefaultAddress(addresses, row.key))}
                  />
                  Implicită (e-Factura)
                </label>
                {addresses.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange(removeClientAddress(addresses, row.key))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Elimină
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">Tip adresă</label>
                <select
                  value={row.address_type}
                  onChange={e => update(row.key, { address_type: e.target.value })}
                  className="input bg-white"
                >
                  {CLIENT_ADDRESS_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">
                  Stradă / adresă {row.is_default ? '*' : ''}
                </label>
                <input
                  type="text"
                  value={row.address}
                  onChange={e => update(row.key, { address: e.target.value })}
                  className="input"
                  placeholder="Str. Exemplu, nr. 1"
                />
              </div>
              <RoAddressFields
                value={{
                  county_code: row.county_code,
                  postal_code: row.postal_code,
                  city: row.city,
                  country: row.country
                }}
                onChange={value => update(row.key, value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
