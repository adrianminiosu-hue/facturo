import type { MetadataRoute } from 'next'
import { siteUrl } from '@/config/company'

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/gdpr', '/termeni', '/contact']
  return pages.map(path => ({
    url: `${siteUrl}${path || '/'}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'weekly' : 'yearly',
    priority: path === '' ? 1 : 0.3
  }))
}
