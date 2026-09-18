export function displayUserName(name?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return parts
    .map(part => part.charAt(0).toLocaleUpperCase('ro-RO') + part.slice(1).toLocaleLowerCase('ro-RO'))
    .join(' ')
}

export function userGreeting(name?: string | null) {
  const shown = displayUserName(name)
  return shown ? `Bună ziua, ${shown}!` : 'Bună ziua'
}
