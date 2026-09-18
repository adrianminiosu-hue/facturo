export function displayUserName(name?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return parts
    .map(part => part.charAt(0).toLocaleUpperCase('ro-RO') + part.slice(1).toLocaleLowerCase('ro-RO'))
    .join(' ')
}

export function userInitials(name?: string | null, email?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toLocaleUpperCase('ro-RO')
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toLocaleUpperCase('ro-RO')
  }
  const local = (email || '').split('@')[0]
  return (local.slice(0, 2) || '?').toLocaleUpperCase('ro-RO')
}

export function userGreeting(name?: string | null) {
  const shown = displayUserName(name)
  return shown ? `Bună ziua, ${shown}!` : 'Bună ziua'
}
