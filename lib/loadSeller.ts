export async function loadSeller(
  supabase: { from: (table: string) => any },
  invoice: { company_id?: string | null; user_id?: string | null },
  userId: string
) {
  if (invoice.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', invoice.company_id)
      .single()
    if (company) return company
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return profile
}
