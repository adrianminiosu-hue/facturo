import Link from 'next/link'

export default function GDPR() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">Facturo</Link>
        <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition">
          Autentificare
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Politica de confidențialitate & GDPR</h1>
          <p className="text-gray-500 mt-2">Ultima actualizare: Mai 2026</p>
        </div>

        <div className="space-y-8 text-gray-700">

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">1. Cine suntem</h2>
            <p className="text-sm leading-relaxed">
              Facturo este o platformă de facturare online destinată companiilor din România. 
              Suntem operatorul datelor cu caracter personal colectate prin intermediul acestei aplicații, 
              în conformitate cu Regulamentul (UE) 2016/679 (GDPR) și legislația română aplicabilă.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">2. Ce date colectăm</h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">Date de cont</p>
                  <p className="text-gray-500">Adresa de email și parola (stocată criptat) folosite pentru autentificare.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">Date fiscale ale companiei tale</p>
                  <p className="text-gray-500">CUI, denumire, adresă, IBAN — necesare pentru generarea facturilor. Aceste date sunt introduse de tine și stocate securizat.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">Date despre clienții tăi</p>
                  <p className="text-gray-500">Datele clienților pe care îi adaugi în aplicație (denumire, CUI, email, IBAN). Ești responsabil pentru colectarea acordului clienților tăi.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">Date de facturare</p>
                  <p className="text-gray-500">Facturile emise, inclusiv produse/servicii, valori și TVA.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-black mt-1.5 flex-shrink-0"></span>
                <div>
                  <p className="font-medium text-gray-900">Date tehnice</p>
                  <p className="text-gray-500">Adresa IP, tipul browserului și date de utilizare pentru îmbunătățirea serviciului.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">3. Cum folosim datele</h2>
            <div className="space-y-2 text-sm leading-relaxed">
              <p>✓ Pentru a furniza serviciul de facturare online</p>
              <p>✓ Pentru a genera și trimite facturi PDF</p>
              <p>✓ Pentru a prelua date fiscale din registrul ANAF</p>
              <p>✓ Pentru a trimite notificări despre cont și facturi</p>
              <p>✓ Pentru a îmbunătăți aplicația pe baza feedback-ului</p>
              <p className="text-red-500">✗ Nu vindem datele tale către terți</p>
              <p className="text-red-500">✗ Nu folosim datele pentru publicitate</p>
              <p className="text-red-500">✗ Nu transferăm date în afara UE fără garanții adecvate</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">4. Temeiul legal al prelucrării</h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <p><span className="font-medium">Executarea contractului</span> — prelucrăm datele pentru a furniza serviciul la care te-ai abonat.</p>
              <p><span className="font-medium">Obligație legală</span> — păstrăm datele fiscale conform legislației contabile românești (10 ani).</p>
              <p><span className="font-medium">Interes legitim</span> — îmbunătățirea serviciului și prevenirea fraudelor.</p>
              <p><span className="font-medium">Consimțământ</span> — pentru comunicări de marketing, dacă ți-ai dat acordul explicit.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">5. Cu cine partajăm datele</h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900">Supabase (baza de date)</p>
                  <p className="text-gray-500 text-xs mt-1">Stocarea securizată a datelor. Servere în UE. Certificat SOC 2 Type II.</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900">Resend (email tranzacțional)</p>
                  <p className="text-gray-500 text-xs mt-1">Folosit exclusiv pentru trimiterea facturilor pe email. Date minime partajate.</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900">ANAF (date publice)</p>
                  <p className="text-gray-500 text-xs mt-1">Consultăm registrul public ANAF pentru completarea automată a datelor fiscale.</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900">Vercel (hosting)</p>
                  <p className="text-gray-500 text-xs mt-1">Infrastructura aplicației. Servere în UE disponibile. Certificat ISO 27001.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">6. Drepturile tale</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">Dreptul de acces</p>
                <p className="text-gray-500 text-xs mt-1">Poți solicita oricând o copie a datelor tale.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">Dreptul la rectificare</p>
                <p className="text-gray-500 text-xs mt-1">Poți corecta datele incorecte direct din aplicație.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">Dreptul la ștergere</p>
                <p className="text-gray-500 text-xs mt-1">Poți solicita ștergerea contului și a datelor asociate.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">Dreptul la portabilitate</p>
                <p className="text-gray-500 text-xs mt-1">Poți exporta datele tale în format structurat.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">Dreptul la opoziție</p>
                <p className="text-gray-500 text-xs mt-1">Poți obiecta față de anumite tipuri de prelucrare.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium text-gray-900">Dreptul de a depune plângere</p>
                <p className="text-gray-500 text-xs mt-1">Poți contacta ANSPDCP la anspdcp.eu.</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">7. Securitatea datelor</h2>
            <div className="space-y-2 text-sm leading-relaxed">
              <p>✓ Toate datele sunt transmise prin conexiuni HTTPS criptate</p>
              <p>✓ Parolele sunt stocate folosind algoritmi de hashing (bcrypt)</p>
              <p>✓ Accesul la date este controlat prin Row Level Security (RLS)</p>
              <p>✓ Fiecare utilizator vede exclusiv propriile date</p>
              <p>✓ Backup-uri automate zilnice ale bazei de date</p>
              <p>✓ Monitorizare continuă pentru detectarea accesului neautorizat</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">8. Retenția datelor</h2>
            <div className="space-y-2 text-sm leading-relaxed">
              <p><span className="font-medium">Date de cont:</span> păstrate pe durata utilizării serviciului + 30 zile după ștergerea contului.</p>
              <p><span className="font-medium">Date fiscale și facturi:</span> păstrate 10 ani conform legislației contabile românești (Legea 82/1991).</p>
              <p><span className="font-medium">Date tehnice:</span> păstrate maxim 12 luni.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">9. Contact</h2>
            <p className="text-sm leading-relaxed">
              Pentru orice întrebare legată de datele tale personale sau pentru exercitarea drepturilor tale, 
              ne poți contacta la:
            </p>
            <div className="mt-3 bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-900">Facturo</p>
              <p className="text-sm text-gray-500">Email: privacy@facturo.ro</p>
              <p className="text-sm text-gray-500">Răspundem în maxim 72 de ore.</p>
            </div>
          </div>

        </div>

        <div className="mt-10 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition">
            ← Înapoi la Facturo
          </Link>
        </div>
      </div>

      <footer className="bg-white border-t border-gray-100 px-6 py-6 mt-12">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <p className="text-sm text-gray-500">© 2026 Facturo. Toate drepturile rezervate.</p>
          <Link href="/gdpr" className="text-sm text-gray-500 hover:text-gray-900 transition">
            Politica de confidențialitate
          </Link>
        </div>
      </footer>
    </div>
  )
}