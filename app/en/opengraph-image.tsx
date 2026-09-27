import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/brand'

export const alt = `${BRAND.name} — every invoice, followed until the money is in`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px 80px',
          background: '#f6f5f1',
          color: '#0b0d12'
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: '#2f45c6' }}>
          {BRAND.name}
        </div>
        <div style={{ fontSize: 76, lineHeight: 1.04, marginTop: 24, fontWeight: 600, letterSpacing: -2 }}>
          Every invoice,
        </div>
        <div style={{ fontSize: 76, lineHeight: 1.04, fontWeight: 600, letterSpacing: -2 }}>
          followed until the money is in.
        </div>
        <div style={{ fontSize: 28, marginTop: 32, color: '#55575e', maxWidth: 820 }}>
          ANAF, the client, the bank and what comes next: {BRAND.name} watches every step for you.
        </div>
      </div>
    ),
    { ...size }
  )
}
