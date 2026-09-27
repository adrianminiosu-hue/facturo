'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CollectionsDashboard from '@/components/CollectionsDashboard'
import ForecastDashboard from '@/components/ForecastDashboard'
import SalesDashboard from '@/components/SalesDashboard'
import PurchasesDashboard from '@/components/PurchasesDashboard'
import { slotFromParam, visibleDashboardSlots } from '@/lib/dashboardSlots'

const SLOTS = [1, 2, 3, 4] as const
type Slot = (typeof SLOTS)[number]

function isSlot(value: number): value is Slot {
  return (SLOTS as readonly number[]).includes(value)
}

/** The former "Situație e-Factura" slot: that is now the e-Factura page itself. */
const EFACTURA_SLOT = 5

export default function ExtraDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const slot = slotFromParam(params.slot)
  useEffect(() => {
    if (slot === EFACTURA_SLOT) router.replace('/efactura')
  }, [slot, router])
  if (slot === EFACTURA_SLOT) return null
  if (!isSlot(slot) || !visibleDashboardSlots().includes(slot)) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-gray-500">404</p>
      </div>
    )
  }
  if (slot === 1) return <SalesDashboard />
  if (slot === 2) return <PurchasesDashboard />
  if (slot === 3) return <ForecastDashboard />
  return <CollectionsDashboard />
}
