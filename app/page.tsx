import Link from 'next/link'

export default function Home() {
  return (
    <div className="app-shell flex items-center justify-center">
      <div className="card p-8 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[color:var(--color-foreground)]">Facturo</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">Facturare inteligentă pentru afaceri românești</p>
        </div>
        <div className="space-y-3">
          <Link href="/login" className="btn btn-primary w-full">
            Autentificare
          </Link>
          <Link href="/register" className="btn btn-outline w-full">
            Cont nou
          </Link>
        </div>
      </div>
    </div>
  )
}