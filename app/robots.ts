import type { MetadataRoute } from 'next'
import { siteUrl } from '@/config/company'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/invoices', '/clients', '/banca', '/incasari', '/account', '/profile', '/api/']
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  }
}
