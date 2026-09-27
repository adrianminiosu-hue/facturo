import type { Metadata } from 'next'
import LandingPage from '@/components/landing/LandingPage'
import { redirectIfAuthed } from '@/lib/redirectIfAuthed'
import { siteUrl } from '@/config/company'
import { BRAND } from '@/lib/brand'

const title = `${BRAND.name} — fiecare factură, urmărită până intră banii`
const description = 'Trimite factura la ANAF, amintește clientului când întârzie, leagă plata din extras de factura ei și află dimineața ce ai de făcut.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: '/',
    languages: { ro: '/', en: '/en' }
  },
  openGraph: {
    title,
    description,
    url: '/',
    siteName: BRAND.name,
    locale: 'ro_RO',
    alternateLocale: 'en_GB',
    type: 'website'
  }
}

/** `/?preview` shows the landing page even when signed in (to review it from the app). */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  if (!('preview' in params)) await redirectIfAuthed()
  return <LandingPage lang="ro" />
}
