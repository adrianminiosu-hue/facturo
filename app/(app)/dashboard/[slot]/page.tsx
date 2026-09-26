'use client'
import { useParams } from 'next/navigation'
import CollectionsDashboard from '@/components/CollectionsDashboard'
import ForecastDashboard from '@/components/ForecastDashboard'
import DashboardWorkspace from '@/components/DashboardWorkspace'
import SalesDashboard from '@/components/SalesDashboard'
import PurchasesDashboard from '@/components/PurchasesDashboard'
import { slotFromParam, visibleDashboardSlots } from '@/lib/dashboardSlots'

const SLOTS = [1, 2, 3, 4, 5] as const
type Slot = (typeof SLOTS)[number]

function isSlot(value: number): value is Slot {
  return (SLOTS as readonly number[]).includes(value)
}

export default function ExtraDashboardPage() {
  const params = useParams()
  const slot = slotFromParam(params.slot)
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
  if (slot === 4) return <CollectionsDashboard />
  return <DashboardWorkspace slot={slot} />
}
