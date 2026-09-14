import Link from 'next/link'
import BrandLockup from '@/components/BrandLockup'

const features = [
  { n: '01', title: 'Completare CUI', text: 'Introdu CUI-ul și datele fiscale se completează din registrul public. Fără transcriere.' },
  { n: '02', title: 'PDF de atelier', text: 'Facturi cu aspect editorial, cu toate câmpurile obligatorii pentru România.' },
  { n: '03', title: 'Trimite pe email', text: 'Un click. PDF-ul pleacă atașat, cu datele firmei tale pe document.' },
  { n: '04', title: 'TVA în timp real', text: '21%, 9%, 5% sau scutit. Totalurile se calculează pe măsură ce scrii.' },
  { n: '05', title: 'Dashboard precis', text: 'Emis, neîncasat, luna curentă — fără zgomot vizual, doar cifrele care contează.' },
  { n: '06', title: 'GDPR & UE', text: 'Date stocate în Europa, izolate pe firmă. Fiecare contabil vede doar portofoliul lui.' }
]

export default function Home() {
  return (
    <div className="app-shell">
      <nav className="top-nav">
        <BrandLockup href="/" />
        <div className="flex items-center gap-5">
          <Link href="/login" className="nav-link">Autentificare</Link>
          <Link href="/register" className="btn btn-primary text-sm px-5 py-2">
            Încearcă gratuit
          </Link>
        </div>
      </nav>

      <section className="pt-24 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="kicker mb-8">e-Factura · România</p>
          <h1 className="text-5xl md:text-[4.4rem] leading-[1.05] text-[color:var(--color-foreground)] mb-6">
            Facturare cu
            <span className="block italic text-[color:var(--color-accent)]">prestanță.</span>
          </h1>
          <p className="text-lg md:text-xl text-[color:var(--color-muted-foreground)] max-w-xl mx-auto mb-10 leading-relaxed text-pretty">
            Emite, trimite și urmărește facturi pentru firmele pe care le administrezi —
            cu date din registrul public, PDF și XML, într-un spațiu construit pentru contabil.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="btn btn-primary px-8 py-3.5 text-base">
              Începe gratuit
            </Link>
            <Link href="/login" className="btn btn-outline px-8 py-3.5 text-base">
              Am deja cont
            </Link>
          </div>
          <p className="text-sm text-[color:var(--color-muted-foreground)] mt-5">
            Fără card · Poți începe gratuit
          </p>
        </div>
      </section>

      <section className="px-6 pb-8">
        <div className="max-w-4xl mx-auto card px-8 py-8 grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="brand text-4xl text-[color:var(--color-foreground)]">2 min</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">Până la prima factură</p>
          </div>
          <div className="border-x border-[color:var(--color-border)]">
            <p className="brand text-4xl text-[color:var(--color-foreground)]">ANAF</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">Câmpuri e-Factura</p>
          </div>
          <div>
            <p className="brand text-4xl text-[color:var(--color-foreground)]">0 RON</p>
            <p className="text-sm text-[color:var(--color-muted-foreground)] mt-2">Pentru început</p>
          </div>
        </div>
      </section>

      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="kicker mb-4">Platformă</p>
            <h2 className="text-4xl text-[color:var(--color-foreground)]">Tot ce trebuie. Nimic în plus.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map(f => (
              <div key={f.n} className="card p-7">
                <p className="kicker mb-5">{f.n}</p>
                <h3 className="text-xl brand mb-3">{f.title}</h3>
                <p className="text-sm text-[color:var(--color-muted-foreground)] leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="kicker mb-4">Metodă</p>
            <h2 className="text-4xl text-[color:var(--color-foreground)]">Patru gesturi. O factură.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              ['01', 'Contul', 'Înregistrare în câteva secunde.'],
              ['02', 'Firma', 'CUI → date preluate din registrul public.'],
              ['03', 'Clientul', 'Același ritm, pentru fiecare partener.'],
              ['04', 'Emiterea', 'PDF, email, XML — din aceeași pagină.']
            ].map(([n, t, d]) => (
              <div key={n}>
                <p className="kicker mb-3">{n}</p>
                <h3 className="brand text-2xl mb-2">{t}</h3>
                <p className="text-sm text-[color:var(--color-muted-foreground)]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto card p-12 text-center bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] border-0">
          <h2 className="text-4xl mb-4 text-[color:var(--color-primary-foreground)]">Un atelier pentru facturi.</h2>
          <p className="text-[color:var(--color-primary-foreground)]/70 mb-8">
            Pentru contabilii care lucrează pe mai multe firme și vor un instrument pe măsură.
          </p>
          <Link href="/register" className="btn bg-[color:var(--color-accent)] text-white hover:opacity-90 px-8 py-3.5 text-base">
            Creează cont
          </Link>
        </div>
      </section>

      <footer className="px-6 py-10 border-t border-[color:var(--color-border)]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandLockup href="/" size="sm" />
            <span className="text-sm text-[color:var(--color-muted-foreground)]">Facturare pentru România</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[color:var(--color-muted-foreground)]">
            <Link href="/gdpr" className="hover:text-[color:var(--color-foreground)] transition">Confidențialitate</Link>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
