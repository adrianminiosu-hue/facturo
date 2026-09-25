export const legalCompany = {
  name: 'Finsquare IT Solutions SRL',
  cui: process.env.NEXT_PUBLIC_LEGAL_CUI || 'RO00000000',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'hello@finsquare.ro'
}

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
