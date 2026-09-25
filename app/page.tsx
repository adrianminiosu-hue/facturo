import type { Metadata } from 'next'
import LandingPage from '@/components/landing/LandingPage'
import { redirectIfAuthed } from '@/lib/redirectIfAuthed'
import { siteUrl } from '@/config/company'

const title = 'Facturo — banii firmei tale, sub control'
const description = 'Vezi cine îți datorează, ce intră în cont săptămâna asta și primește-ți banii mai repede.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: '/',
    languages: { ro: '/', en: '/' }
  },
  openGraph: {
    title,
    description,
    url: '/',
    siteName: 'Facturo',
    locale: 'ro_RO',
    alternateLocale: 'en_GB',
    type: 'website'
  }
}

export default async function Home() {
  await redirectIfAuthed()
  return <LandingPage />
}
