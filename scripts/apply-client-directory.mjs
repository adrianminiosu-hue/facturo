import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  console.error('Missing Supabase URL or service key in .env.local')
  process.exit(1)
}

const ref = new URL(url).hostname.split('.')[0]
const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260914_client_contacts_addresses.sql'), 'utf8')

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  })
  const text = await res.text()
  return { status: res.status, text: text.slice(0, 400) }
}

console.log('project_ref', ref)
const contacts = await rest('client_contacts?select=id&limit=1')
const addresses = await rest('client_addresses?select=id&limit=1')
console.log('client_contacts', contacts.status, contacts.text)
console.log('client_addresses', addresses.status, addresses.text)

const attempts = [
  { name: 'pg-meta', endpoint: `${url}/pg/query`, body: { query: 'select 1' } },
  { name: 'pg-meta-sql', endpoint: `${url}/pg/sql`, body: { query: 'select 1' } }
]

for (const attempt of attempts) {
  try {
    const res = await fetch(attempt.endpoint, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(attempt.body)
    })
    const text = await res.text()
    console.log(attempt.name, res.status, text.slice(0, 200))
  } catch (error) {
    console.log(attempt.name, 'error', error instanceof Error ? error.message : String(error))
  }
}

const mgmtHeaders = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
  'Content-Type': 'application/json'
}

try {
  const mgmt = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: mgmtHeaders,
    body: JSON.stringify({ query: 'select 1' })
  })
  const text = await mgmt.text()
  console.log('mgmt_query', mgmt.status, text.slice(0, 300))
} catch (error) {
  console.log('mgmt_query error', error instanceof Error ? error.message : String(error))
}

if (process.env.APPLY === '1' && contacts.status === 404) {
  const apply = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  })
  console.log('apply_pg', apply.status, (await apply.text()).slice(0, 500))
}
