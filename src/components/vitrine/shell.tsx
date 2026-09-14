'use client'

// YAHRIA BUSINESS OS V1 — Shell du site vitrine (10 pages publiques)
// Header sticky avec navigation + CTA « Accéder à la plateforme » → /login ;
// footer collé en bas (min-h-dvh flex + mt-auto), plan complet du site.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, Landmark, Mail, MapPin, Phone } from 'lucide-react'
import { VITRINE_PAGES } from '@/lib/vitrine/content'

export function VitrineShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="dark min-h-dvh flex flex-col bg-background text-foreground" style={{ colorScheme: 'dark' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="YAHRIA — accueil">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-[oklch(0.8_0.12_220)] to-[oklch(0.6_0.14_240)] flex items-center justify-center font-black text-sm text-[oklch(0.16_0.04_255)]">Y</span>
            <span className="leading-none">
              <span className="block font-black tracking-tight text-sm">YAHRIA</span>
              <span className="block text-[9px] text-muted-foreground mt-0.5">BUSINESS OS · V1</span>
            </span>
          </Link>
          <nav className="hidden lg:flex items-center gap-4 flex-1" aria-label="Navigation principale">
            {VITRINE_PAGES.slice(1).map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className={`text-xs whitespace-nowrap transition-colors hover:text-foreground ${pathname === p.href ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Accéder à la plateforme <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        {/* nav mobile — défilement horizontal */}
        <nav className="lg:hidden border-t border-border/40 px-3 py-1.5 flex gap-1.5 overflow-x-auto os-scroll" aria-label="Navigation mobile">
          {VITRINE_PAGES.slice(1).map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${pathname === p.href ? 'bg-primary/15 border-primary/30 text-primary' : 'border-border text-muted-foreground'}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* ── Contenu ── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t border-border/60 bg-sidebar/40">
        <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 md:grid-cols-4 text-xs">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-[oklch(0.8_0.12_220)] to-[oklch(0.6_0.14_240)] flex items-center justify-center font-black text-sm text-[oklch(0.16_0.04_255)]">Y</span>
              <span className="font-black tracking-tight">YAHRIA BUSINESS OS</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Le système d&apos;exploitation intelligent des entreprises africaines.
              Données → Intelligence → Décision → Exécution, sous gouvernance.
            </p>
            <p className="font-mono text-[10px] text-muted-foreground/70">YBOS-ARCH-V1 · baseline 1.2.0</p>
          </div>
          <div>
            <p className="font-semibold mb-3">Plateforme</p>
            <ul className="space-y-2 text-muted-foreground">
              {['/solution', '/fonctionnalites', '/secteurs', '/securite', '/tarifs'].map((h) => {
                const p = VITRINE_PAGES.find((x) => x.href === h)!
                return (
                  <li key={h}><Link href={h} className="hover:text-foreground transition-colors">{p.label}</Link></li>
                )
              })}
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3">Entreprise</p>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link href="/a-propos" className="hover:text-foreground transition-colors">À propos</Link></li>
              <li><Link href="/annonces" className="hover:text-foreground transition-colors">Annonces</Link></li>
              <li><Link href="/contacts" className="hover:text-foreground transition-colors">Contacts</Link></li>
              <li><Link href="/login" className="hover:text-foreground transition-colors">Connexion plateforme</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3">Contact</p>
            <ul className="space-y-2.5 text-muted-foreground">
              <li className="flex items-start gap-2"><Mail className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" /> contact@yahria.business</li>
              <li className="flex items-start gap-2"><Phone className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" /> +225 27 20 00 00 00</li>
              <li className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" /> Abidjan · Dakar · Cotonou</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/40">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><Landmark className="h-3 w-3" /> Conforme OHADA · SYSCOHADA révisé · multi-tenant PAR CONSTRUCTION</span>
            <span>© 2026 YAHRIA — Tous droits réservés</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
