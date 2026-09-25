/** Dashboards 1 (Vânzări) and 4 (Urmărire încasări) are live; 2, 3, 5 are still drafts. */
export const LIVE_DASHBOARD_SLOTS = [1, 4] as const
export const DRAFT_DASHBOARD_SLOTS = [2, 3, 5] as const

/** Drafts show on localhost, or anywhere NEXT_PUBLIC_SHOW_DRAFT_DASHBOARDS=1; never by default in production. */
export function showDraftDashboards() {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_DRAFT_DASHBOARDS === '1'
}

export function visibleDashboardSlots(): number[] {
  return [...LIVE_DASHBOARD_SLOTS, ...(showDraftDashboards() ? DRAFT_DASHBOARD_SLOTS : [])].sort((a, b) => a - b)
}

/** Readable URLs: /dashboard/vanzari instead of /dashboard/1 (numbers still resolve). */
export const DASHBOARD_SLUGS: Record<number, string> = {
  1: 'vanzari',
  2: 'achizitii',
  3: 'forecast',
  4: 'incasari',
  5: 'efactura'
}

export function dashboardHref(slot: number) {
  return `/dashboard/${DASHBOARD_SLUGS[slot] || slot}`
}

export function slotFromParam(param: string | string[] | undefined): number {
  const value = String(Array.isArray(param) ? param[0] : param || '').toLowerCase()
  const bySlug = Object.entries(DASHBOARD_SLUGS).find(([, slug]) => slug === value)
  return bySlug ? Number(bySlug[0]) : Number(value)
}
