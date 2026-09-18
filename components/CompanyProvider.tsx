'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ACTIVE_COMPANY_KEY, companyFromRow, emptyCompanyFields, type Company } from '@/lib/company'
import { loadMembershipOwnerIds, uniqueIds, type PortfolioRole } from '@/lib/portfolio'

type CompanyContextValue = {
  userId: string
  userEmail: string
  userName: string
  userAvatarUrl: string
  companies: Company[]
  company: Company | null
  ownerUserId: string
  isOwner: boolean
  role: PortfolioRole
  accessibleCompanyIds: string[]
  accessibleOwnerIds: string[]
  loading: boolean
  setActiveCompanyId: (id: string) => void
  refreshCompanies: () => Promise<void>
  createCompany: (fields?: Partial<Company>) => Promise<Company | null>
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

async function acceptPendingInvites(userId: string) {
  try {
    await fetch('/api/team/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    })
  } catch {
    /* invite table may be missing */
  }
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setUserId('')
      setUserEmail('')
      setUserName('')
      setUserAvatarUrl('')
      setCompanies([])
      setCompanyId('')
      setLoading(false)
      return
    }
    setUserId(user.id)
    setUserEmail(user.email || '')
    setUserName(String(user.user_metadata?.full_name || user.user_metadata?.name || ''))
    setUserAvatarUrl(String(user.user_metadata?.avatar_url || ''))
    await acceptPendingInvites(user.id)

    const owned = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    let rows = owned.data || []
    if (!owned.error && rows.length === 0) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profile?.company_name) {
        const { data: created } = await supabase
          .from('companies')
          .insert({
            user_id: user.id,
            ...emptyCompanyFields,
            company_name: profile.company_name,
            cui: profile.cui || '',
            reg_com: profile.reg_com || '',
            address: profile.address || '',
            city: profile.city || '',
            county: profile.county || '',
            county_code: profile.county_code || '',
            postal_code: profile.postal_code || '',
            country: profile.country || 'RO',
            vat_registered: profile.vat_registered !== false,
            bank_name: profile.bank_name || '',
            iban: profile.iban || '',
            bic: profile.bic || '',
            iban_currency: profile.iban_currency === 'EUR' ? 'EUR' : 'LEI',
            contact_person: profile.contact_person || '',
            contact_role: profile.contact_role || '',
            email: profile.email || '',
            phone: profile.phone || '',
            invoice_series: profile.invoice_series || 'FCT',
            invoice_start_number: profile.invoice_start_number || 1
          })
          .select()
          .single()
        if (created) rows = [created]
      }
    }

    const membership = await loadMembershipOwnerIds(supabase, user.id)
    if (membership.ownerIds.length) {
      const shared = await supabase
        .from('companies')
        .select('*')
        .in('user_id', membership.ownerIds)
        .order('created_at', { ascending: true })
      const seen = new Set(rows.map(row => row.id))
      for (const row of shared.data || []) {
        if (!seen.has(row.id)) {
          seen.add(row.id)
          rows.push(row)
        }
      }
    }

    const list = rows.map(row => companyFromRow(row, String(row.user_id || user.id)))
    setCompanies(list)
    const stored = localStorage.getItem(ACTIVE_COMPANY_KEY)
    const next = list.find(c => c.id === stored)?.id || list[0]?.id || ''
    setCompanyId(next)
    if (next) localStorage.setItem(ACTIVE_COMPANY_KEY, next)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const { data } = supabase.auth.onAuthStateChange(() => { load() })
    return () => data.subscription.unsubscribe()
  }, [load])

  const setActiveCompanyId = (id: string) => {
    setCompanyId(id)
    localStorage.setItem(ACTIVE_COMPANY_KEY, id)
  }

  const createCompany = async (fields?: Partial<Company>) => {
    if (!userId) return null
    const { id: _omitId, user_id: _omitUser, ...rest } = (fields || {}) as Partial<Company> & { id?: string }
    const { data, error } = await supabase
      .from('companies')
      .insert({
        ...emptyCompanyFields,
        ...rest,
        user_id: userId,
        company_name: rest.company_name || 'Firmă nouă'
      })
      .select()
      .single()
    if (error || !data) {
      alert(error?.message || 'Nu s-a putut crea firma. Rulează migrarea multi-company în Supabase.')
      return null
    }
    const created = companyFromRow(data, userId)
    setCompanies(prev => [...prev, created])
    setActiveCompanyId(created.id)
    return created
  }

  const company = useMemo(
    () => companies.find(c => c.id === companyId) || null,
    [companies, companyId]
  )
  const ownerUserId = company?.user_id || userId
  const isOwner = !company || company.user_id === userId
  const role: PortfolioRole = isOwner ? 'owner' : 'operator'
  const accessibleCompanyIds = useMemo(() => companies.map(c => c.id), [companies])
  const accessibleOwnerIds = useMemo(
    () => uniqueIds([userId, ...companies.map(c => c.user_id)]),
    [companies, userId]
  )

  return (
    <CompanyContext.Provider value={{
      userId,
      userEmail,
      userName,
      userAvatarUrl,
      companies,
      company,
      ownerUserId,
      isOwner,
      role,
      accessibleCompanyIds,
      accessibleOwnerIds,
      loading,
      setActiveCompanyId,
      refreshCompanies: load,
      createCompany
    }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider')
  return ctx
}
