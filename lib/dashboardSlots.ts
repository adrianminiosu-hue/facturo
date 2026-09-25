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
