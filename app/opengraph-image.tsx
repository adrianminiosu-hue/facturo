import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/brand'

export const alt = `${BRAND.name} — banii firmei tale, sub control`
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
          background: '#f4f6f9',
          color: '#111827'
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: '#4b5563' }}>
          {BRAND.name}
        </div>
        <div style={{ fontSize: 72, lineHeight: 1.05, marginTop: 24 }}>
          Banii firmei tale,
        </div>
        <div style={{ fontSize: 72, lineHeight: 1.05, fontStyle: 'italic', color: '#2563eb' }}>
          sub control.
        </div>
        <div style={{ fontSize: 28, marginTop: 28, color: '#4b5563', maxWidth: 720 }}>
          Vezi cine îți datorează și ce intră în cont săptămâna asta.
        </div>
      </div>
    ),
    { ...size }
  )
}
