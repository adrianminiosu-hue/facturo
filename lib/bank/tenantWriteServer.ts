export type QueryResult<T> = { data: T; error: { message: string } | null }

export type QueryChain<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string) => QueryChain<T>
  eq: (column: string, value: unknown) => QueryChain<T>
  neq: (column: string, value: unknown) => QueryChain<T>
  in: (column: string, values: unknown[]) => QueryChain<T>
  maybeSingle: () => Promise<QueryResult<T>>
}

export type QueryClient = {
  from: (table: string) => {
    select: (columns?: string) => QueryChain
    insert: (values: unknown) => QueryChain
    update: (values: Record<string, unknown>) => QueryChain
    delete: () => QueryChain
  }
}

export async function tenantWriteVerified(
  client: QueryClient,
  opts: { userId: string; companyId: string; createdBy?: string | null }
) {
  if (!opts.userId || !opts.companyId) {
    throw new Error('tenantWriteVerified requires userId and companyId')
  }
  const { data, error } = await client
    .from('companies')
    .select('id, user_id')
    .eq('id', opts.companyId)
    .eq('user_id', opts.userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('company/user mismatch')
  return {
    user_id: opts.userId,
    company_id: opts.companyId,
    created_by: opts.createdBy || opts.userId
  }
}
