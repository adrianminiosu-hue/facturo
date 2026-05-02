import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Facturo</h1>
          <p className="text-gray-500 mt-1">Facturare inteligentă pentru afaceri românești</p>
        </div>
        <div className="space-y-3">
          <Link href="/login" className="block w-full bg-black text-white text-center py-3 rounded-xl font-medium hover:bg-gray-800 transition">
            Autentificare
          </Link>
          <Link href="/register" className="block w-full border border-gray-200 text-gray-700 text-center py-3 rounded-xl font-medium hover:bg-gray-50 transition">
            Cont nou
          </Link>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">
          <Link href="/gdpr" className="hover:text-gray-600 transition">
            Politică de confidențialitate & GDPR
          </Link>
        </p>
      </div>
    </div>
  )
}