import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'
import { COUNTRY_PACKS } from '@/lib/vitrine/content'

export const metadata: Metadata = {
  title: 'Pays — YAHRIA BUSINESS OS',
  description:
    'Country Packs Côte d\u2019Ivoire, Sénégal et Bénin : rails Mobile Money nationaux, devise locale, conformité OHADA et isolation INV-011 garantie.',
}

export default function PaysPage() {
  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="text-[11px] font-bold tracking-widest text-primary">PAYS</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight max-w-3xl">
            Trois marchés nationaux, zéro mélange
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            L&apos;architecture multi-pays repose sur une règle simple : une organisation ne
            peut opérer que sur les rails de son marché national. INV-011 garantit cette
            isolation par construction — le test est exécutable depuis la plateforme, et tout
            rail étranger est rejeté en DENY avec preuve signée.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14 grid md:grid-cols-3 gap-4">
          {COUNTRY_PACKS.map((c) => (
            <div key={c.code} className="rounded-xl border border-border bg-card p-6 flex flex-col">
              <div className="flex items-center justify-between">
                <p className="text-4xl">{c.drapeau}</p>
                <span className="text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-2 py-0.5">
                  {c.statut}
                </span>
              </div>
              <h2 className="mt-4 text-lg font-bold">{c.nom}</h2>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                <MapPin className="h-3 w-3" /> {c.ville} · {c.devise}
              </p>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed flex-1">{c.detail}</p>
              <p className="mt-4 text-[10px] font-bold tracking-widest text-muted-foreground">RAILS AUTORISÉS</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.rails.map((r) => (
                  <span key={r} className="text-[10px] rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">{r}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* INV-011 expliqué */}
      <section className="border-b border-border/60 bg-sidebar/30">
        <div className="max-w-6xl mx-auto px-4 py-14 grid md:grid-cols-2 gap-8 items-start">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> INV-011 — ISOLATION PAYS
            </p>
            <h2 className="mt-2 text-xl md:text-2xl font-bold tracking-tight">Une règle nationale, pas une préférence</h2>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              Dans la plateforme, la couche policy consulte le Country Pack de
              l&apos;organisation avant tout paiement. Si le rail demandé n&apos;appartient pas
              au marché national de l&apos;entité, l&apos;opération est refusée avant toute
              écriture : pas de « tolérance configurable », une frontière.
            </p>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Le tenant Golfe Trading (Bénin) embarque d&apos;ailleurs dans son historique un
              paiement ORANGE_MONEY volontairement rejeté : la démonstration d&apos;isolation
              est visible dans les données, pas seulement dans la documentation.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <p className="text-xs font-bold tracking-widest text-muted-foreground">EXEMPLE DE DÉCISION</p>
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-[10px] font-bold text-red-400">DENY — RAIL ÉTRANGER</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">rail=ORANGE_MONEY · org=Golfe Trading (BJ)</p>
              <p className="text-[11px] text-muted-foreground mt-1">Evidence signée + audit POLICY_DENY tracé.</p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-[10px] font-bold text-emerald-400">ALLOW — RAIL NATIONAL</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">rail=WAVE · org=Golfe Trading (BJ)</p>
              <p className="text-[11px] text-muted-foreground mt-1">Exécution + Evidence + constats sectoriels attachés.</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Votre marché est prêt</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
            Abidjan, Dakar, Cotonou : la plateforme opère déjà. Et les prochains packs suivent la même mécanique.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Accéder à la plateforme <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </VitrineShell>
  )
}
