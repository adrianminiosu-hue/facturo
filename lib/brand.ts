/**
 * Product brand. Switch with NEXT_PUBLIC_BRAND=veyro|facturo (default veyro) and redeploy:
 * name, logo, favicon, page titles, emails and PDFs follow. Internal identifiers
 * (cookies, storage keys, headers, the [[FACTURO_*]] note marks saved in the database) keep
 * their old names on purpose, so switching never breaks sessions or data.
 */
export type BrandId = 'veyro' | 'facturo'

export type Brand = {
  id: BrandId
  name: string
  domain: string
  icon: string
  /** Colour behind the app icon / social image. */
  ink: string
  paper: string
}

export const BRANDS: Record<BrandId, Brand> = {
  veyro: {
    id: 'veyro',
    name: 'Veyro',
    domain: 'veyro.ro',
    icon: '/brand/veyro-icon.svg',
    ink: '#0B0D12',
    paper: '#F4F2EC'
  },
  facturo: {
    id: 'facturo',
    name: 'Facturo',
    domain: 'facturo.ro',
    icon: '/brand/facturo-favicon.ico',
    ink: '#111827',
    paper: '#f4f6f9'
  }
}

export const BRAND_ID: BrandId = process.env.NEXT_PUBLIC_BRAND === 'facturo' ? 'facturo' : 'veyro'
export const BRAND = BRANDS[BRAND_ID]

/** Replaces the product name in copy written with "Facturo". */
export function withBrand(text: string) {
  return BRAND_ID === 'facturo' ? text : text.replace(/Facturo/g, BRAND.name).replace(/facturo\.ro/g, BRAND.domain)
}
