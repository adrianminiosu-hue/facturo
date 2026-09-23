import type { MessageKey } from '@/lib/messages'
import { isMessageKey } from '@/lib/messages'

const ROLE_KEYS: Record<string, MessageKey> = {
  Administrator: 'role.administrator',
  Contabil: 'role.accountant',
  Director: 'role.director',
  'Contact facturare': 'role.billing',
  Altele: 'role.other'
}

export function roleMessageKey(role?: string | null): MessageKey | null {
  if (!role) return null
  return ROLE_KEYS[role] || null
}

export function displayRole(t: (key: MessageKey) => string, role?: string | null) {
  if (!role) return ''
  const key = roleMessageKey(role)
  return key ? t(key) : role
}

export function addressTypeKey(value?: string | null): MessageKey {
  const key = `addr.${value || 'sediu_social'}`
  return isMessageKey(key) ? key : 'addr.sediu_social'
}

export function legalFormKey(code?: string | null): MessageKey | null {
  if (!code) return null
  const key = `legal.${code}`
  return isMessageKey(key) ? key : null
}

export function invoiceTypeKey(code?: string | null): MessageKey {
  const key = `ef.type.${code || '380'}`
  return isMessageKey(key) ? key : 'ef.type.380'
}

export function paymentMeansKey(code?: string | null): MessageKey | null {
  if (!code) return null
  const key = `ef.pay.${code}`
  return isMessageKey(key) ? key : null
}

export function unitMessageKey(code?: string | null): MessageKey | null {
  if (!code) return null
  const key = `ef.unit.${code}`
  return isMessageKey(key) ? key : null
}

export function vatCategoryKey(code?: string | null): MessageKey | null {
  if (!code) return null
  const key = `ef.vat.${code}`
  return isMessageKey(key) ? key : null
}

export function outcomeKey(outcome: string): MessageKey {
  const key = `inv.outcome.${outcome}`
  return isMessageKey(key) ? key : 'inv.outcome.error'
}
