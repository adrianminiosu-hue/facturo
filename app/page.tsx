import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">Facturo</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition">
              Autentificare
            </Link>
            <Link href="/register" className="bg-black text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-gray-800 transition">
              Încearcă gratuit
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5 text-sm text-gray-600 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Conform cu e-Factura ANAF 2024
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
            Facturare simplă pentru
            <span className="block text-gray-400">afaceri românești</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Creează facturi profesionale, trimite-le pe email și gestionează-ți clienții — 
            cu completare automată din registrul ANAF.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="bg-black text-white px-8 py-4 rounded-2xl font-medium text-lg hover:bg-gray-800 transition">
              Începe gratuit →
            </Link>
            <Link href="/login" className="border border-gray-200 text-gray-700 px-8 py-4 rounded-2xl font-medium text-lg hover:bg-gray-50 transition">
              Am deja cont
            </Link>
          </div>
          <p className="text-sm text-gray-400 mt-4">Fără card de credit · Gratuit pentru primele 5 facturi</p>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-8 border-y border-gray-100 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-gray-900">2 min</p>
              <p className="text-sm text-gray-500 mt-1">Prima factură emisă</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">100%</p>
              <p className="text-sm text-gray-500 mt-1">Conform ANAF</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">0 RON</p>
              <p className="text-sm text-gray-500 mt-1">Pentru început</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">Tot ce ai nevoie pentru facturare</h2>
            <p className="text-gray-500 mt-3">Construit special pentru companiile din România</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center mb-4">
                <span className="text-white text-lg">⚡</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Completare automată ANAF</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Introdu CUI-ul clientului și datele fiscale se completează automat din registrul ANAF. 
                Zero bătaie de cap.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center mb-4">
                <span className="text-white text-lg">📄</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">PDF profesional instant</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Generează facturi PDF cu aspect profesional, cu toate datele fiscale obligatorii 
                conform legislației române.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center mb-4">
                <span className="text-white text-lg">✉️</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Trimite pe email</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Trimite factura direct pe emailul clientului cu un singur click. 
                PDF-ul se atașează automat.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center mb-4">
                <span className="text-white text-lg">🧮</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">TVA calculat automat</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Selectează cota TVA (21%, 9%, 5% sau 0%) și totalurile se calculează 
                automat în timp real.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center mb-4">
                <span className="text-white text-lg">📊</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Dashboard în timp real</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Vezi dintr-o privire totalul facturat, facturile neîncasate și 
                activitatea lunii curente.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center mb-4">
                <span className="text-white text-lg">🔒</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Securitate & GDPR</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Datele tale sunt stocate securizat în UE, criptate și protejate 
                conform GDPR. Fiecare utilizator vede doar datele lui.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">Cum funcționează</h2>
            <p className="text-gray-500 mt-3">Prima factură în mai puțin de 2 minute</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center text-lg font-bold mx-auto mb-4">1</div>
              <h3 className="font-bold text-gray-900 mb-2">Creează cont</h3>
              <p className="text-sm text-gray-500">Înregistrare gratuită în 30 de secunde</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center text-lg font-bold mx-auto mb-4">2</div>
              <h3 className="font-bold text-gray-900 mb-2">Setează compania</h3>
              <p className="text-sm text-gray-500">Introdu CUI-ul și datele se completează automat</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center text-lg font-bold mx-auto mb-4">3</div>
              <h3 className="font-bold text-gray-900 mb-2">Adaugă client</h3>
              <p className="text-sm text-gray-500">CUI client → date ANAF completate instant</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center text-lg font-bold mx-auto mb-4">4</div>
              <h3 className="font-bold text-gray-900 mb-2">Emite factura</h3>
              <p className="text-sm text-gray-500">PDF generat și trimis pe email în 1 click</p>
            </div>
          </div>
        </div>
      </section>

      

      {/* CTA */}
      <section className="py-20 px-6 bg-black">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Gata să simplifici facturarea?
          </h2>
          <p className="text-gray-400 mb-8">
            Alătură-te companiilor din România care facturează mai rapid cu Facturo.
          </p>
          <Link href="/register" className="inline-block bg-white text-black px-8 py-4 rounded-2xl font-medium text-lg hover:bg-gray-100 transition">
            Creează cont gratuit →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="font-bold text-gray-900">Facturo</span>
            <span className="text-sm text-gray-400">Facturare inteligentă pentru România</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/gdpr" className="hover:text-gray-600 transition">Confidențialitate & GDPR</Link>
            <span>© 2026 Facturo</span>
          </div>
        </div>
      </footer>
    </div>
  )
}