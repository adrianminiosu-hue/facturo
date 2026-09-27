import type { Metadata } from 'next'
import LandingPage from '@/components/landing/LandingPage'
import { redirectIfAuthed } from '@/lib/redirectIfAuthed'
import { siteUrl } from '@/config/company'
import { BRAND } from '@/lib/brand'

const title = `${BRAND.name} — every invoice, followed until the money is in`
const description = 'Sends the invoice to ANAF, reminds the client when they are late, matches the bank payment to its invoice and tells you each morning what to do.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: '/en',
    languages: { ro: '/', en: '/en' }
  },
  openGraph: {
    title,
    description,
    url: '/en',
    siteName: BRAND.name,
    locale: 'en_GB',
    alternateLocale: 'ro_RO',
    type: 'website'
  }
}

/** English landing page. `/en?preview` shows it even when signed in. */
export default async function HomeEn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  if (!('preview' in params)) await redirectIfAuthed()
  return <LandingPage lang="en" />
}
