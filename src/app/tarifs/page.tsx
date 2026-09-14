import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'
import { PLANS } from '@/lib/vitrine/content'

export const metadata: Metadata = {
  title: 'Tarifs — YAHRIA BUSINESS OS',
  description:
    'Essentiel, Business, Entreprise : des formules en FCFA pour chaque stade de croissance. Multi-tenant, Country Packs, agents IA gouvernés, exports SYSCOHADA.',
}

export default function TarifsPage() {
  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14 text-center">
          <p className="text-[11px] font-bold tracking-widest text-primary">TARIFS</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">
            Un prix clair, une gouvernance complète
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Toutes les formules incluent les 6 invariants PAR CONSTRUCTION, le journal
            d&apos;audit immuable et les mises à jour des Country Packs. Sans frais cachés,
            sans engagement de durée.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14 grid md:grid-cols-3 gap-5 items-stretch">
          {PLANS.map((p) => (
            <div
              key={p.nom}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                p.vedette
                  ? 'border-primary/50 bg-primary/5 shadow-xl shadow-primary/10'
                  : 'border-border bg-card'
              }`}
            >
              {p.vedette && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1">
                  <Sparkles className="h-3 w-3" /> Le plus choisi
                </span>
              )}
              <h2 className="text-sm font-bold">{p.nom}</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">{p.cible}</p>
              <p className="mt-4">
                <span className="text-3xl font-black tracking-tight">{p.prix}</span>
                {p.periode && <span className="text-xs text-muted-foreground"> {p.periode}</span>}
              </p>
              <ul className="mt-5 space-y-2.5 flex-1">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{pt}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/contacts"
                className={`mt-6 inline-flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold transition-colors ${
                  p.vedette
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border border-border hover:bg-accent/60'
                }`}
              >
                {p.nom === 'Entreprise' ? 'Demander un devis' : 'Commencer'} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ tarifs */}
      <section>
        <div className="max-w-4xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Questions fréquentes</h2>
          <div className="mt-6 space-y-3">
            {[
              {
                q: 'Les comptes de démonstration sont-ils gratuits ?',
                a: 'Oui. Trois tenants (Côte d\u2019Ivoire, Sénégal, Bénin) et dix comptes couvrant les six rôles sont disponibles publiquement depuis la page de connexion. Le mot de passe de démonstration est affiché sur cette même page.',
              },
              {
                q: 'Que se passe-t-il à la fin de la période d\u2019essai ?',
                a: 'Rien de forcé : vos données restent consultables et exportables (SYSCOHADA PDF/Excel). Vous choisissez une formule ou partez avec vos données — sans rétention hostile.',
              },
              {
                q: 'Les rails Mobile Money sont-ils inclus ?',
                a: 'Les rails de votre Country Pack national sont inclus dans chaque formule (Essentiel : 2 rails ; Business : tous). L\u2019isolation des rails est structurelle : INV-011.',
              },
              {
                q: 'Puis-je ajouter un second pays plus tard ?',
                a: 'Oui, via la formule Entreprise : chaque pays additionnel embarque son pack national (rails, conformité, devise) et reste strictement isolé du premier — multi-tenants PAR CONSTRUCTION.',
              },
              {
                q: 'La 2FA est-elle vraiment obligatoire ?',
                a: 'Oui, pour l\u2019ensemble des rôles, déployée par vagues. C\u2019est un verrou structurel : aucune route métier n\u2019est accessible tant que l\u2019enrôlement TOTP n\u2019est pas effectué.',
              },
            ].map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-card p-4 open:border-primary/30">
                <summary className="cursor-pointer text-sm font-semibold list-none flex items-center justify-between gap-3">
                  {f.q}
                  <span className="text-primary group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </VitrineShell>
  )
}
