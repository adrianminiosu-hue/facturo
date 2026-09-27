import type { MetadataRoute } from 'next'
import { siteUrl } from '@/config/company'

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/en', '/gdpr', '/termeni', '/contact']
  return pages.map(path => ({
    url: `${siteUrl}${path || '/'}`,
    lastModified: new Date(),
    changeFrequency: path === '' || path === '/en' ? 'weekly' : 'yearly',
    priority: path === '' ? 1 : path === '/en' ? 0.8 : 0.3
  }))
}
