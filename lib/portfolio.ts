export const MAX_OPERATORS = 1

export type PortfolioRole = 'owner' | 'operator'

export type PortfolioMember = {
  id: string
  owner_user_id: string
  member_user_id?: string | null
  email: string
  role: 'operator'
  status: 'pending' | 'active'
  invite_token: string
  created_at?: string
  accepted_at?: string | null
}

export function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isMissingPortfolioTableError(error: { message?: string; code?: string } | null | undefined) {
  const msg = (error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (msg.includes('portfolio_members') && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')))
  )
}

export function tenantWrite(opts: {
  ownerUserId: string
  actorUserId: string
  companyId?: string | null
}) {
  return {
    user_id: opts.ownerUserId,
    created_by: opts.actorUserId,
    ...(opts.companyId ? { company_id: opts.companyId } : {})
  }
}

export function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => !!id))]
}

type QueryClient = { from: (table: string) => any }

export async function loadMembershipOwnerIds(client: QueryClient, memberUserId: string) {
  const { data, error } = await client
    .from('portfolio_members')
    .select('owner_user_id')
    .eq('member_user_id', memberUserId)
    .eq('status', 'active')
  if (error) {
    if (isMissingPortfolioTableError(error)) return { ownerIds: [] as string[], missingTable: true }
    return { ownerIds: [] as string[], missingTable: false, error: error.message }
  }
  return {
    ownerIds: uniqueIds((data || []).map((row: { owner_user_id: string }) => row.owner_user_id)),
    missingTable: false
  }
}

export async function actorCanAccessOwner(client: QueryClient, actorUserId: string, ownerUserId?: string | null) {
  if (!actorUserId || !ownerUserId) return false
  if (actorUserId === ownerUserId) return true
  const { data, error } = await client
    .from('portfolio_members')
    .select('id')
    .eq('owner_user_id', ownerUserId)
    .eq('member_user_id', actorUserId)
    .eq('status', 'active')
    .maybeSingle()
  if (error && isMissingPortfolioTableError(error)) return false
  return !!data
}

export async function getInvoiceForActor(client: QueryClient, invoiceId: string, actorUserId: string) {
  const { data: invoice } = await client.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
  if (!invoice) return null
  const allowed = await actorCanAccessOwner(client, actorUserId, invoice.user_id)
  return allowed ? invoice : null
}

export async function getCompanyForActor(client: QueryClient, companyId: string, actorUserId: string) {
  const { data: company } = await client.from('companies').select('*').eq('id', companyId).maybeSingle()
  if (!company) return null
  const allowed = await actorCanAccessOwner(client, actorUserId, company.user_id)
  return allowed ? company : null
}
