import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight, Gauge, Landmark, ShieldCheck, Users, Workflow, FileText, Globe2,
  Bot, Layers, TrendingUp, Wallet, BellRing, Megaphone,
} from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'
import { MODULES, COUNTRY_PACKS, latestAnnonces, CATEGORIE_LABELS } from '@/lib/vitrine/content'

export const metadata: Metadata = {
  title: 'YAHRIA BUSINESS OS — Le système d\u2019exploitation intelligent des entreprises africaines',
  description:
    'Pilotez trésorerie, paiements Mobile Money, finance OHADA et agents IA sous gouvernance. Cockpit décisionnel, multi-tenant, Côte d\u2019Ivoire · Sénégal · Bénin.',
}

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cockpit: Gauge, core: Layers, money: Wallet, finance: Landmark, graph: TrendingUp, agents: Bot,
}

const STATS = [
  { valeur: '6', label: 'invariants PAR CONSTRUCTION', detail: 'garantis par la structure du code, prouvés en runtime' },
  { valeur: '3', label: 'pays couverts', detail: 'Country Packs CI · SN · BJ, rails Mobile Money isolés' },
  { valeur: '13', label: 'secteurs d\u2019activité', detail: 'extensions sectorielles auto-contenues et versionnées' },
  { valeur: '6', label: 'rôles RBAC', detail: 'séparation des pouvoirs : la saisie n\u2019approuve jamais' },
]

export default function AccueilPage() {
  const annonces = latestAnnonces(3)

  return (
    <VitrineShell>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> V1 · multi-tenant · conforme OHADA
            </p>
            <h1 className="mt-5 text-3xl md:text-5xl font-black tracking-tight leading-[1.08]">
              Le système d&apos;exploitation<br />
              <span className="bg-gradient-to-r from-[oklch(0.8_0.12_220)] to-[oklch(0.65_0.15_250)] bg-clip-text text-transparent">
                intelligent
              </span>{' '}des entreprises<br className="hidden md:block" /> africaines.
            </h1>
            <p className="mt-5 text-sm md:text-base text-muted-foreground leading-relaxed max-w-xl">
              Données → Intelligence → Décision → Exécution, sous gouvernance.
              Trésorerie, paiements Mobile Money, finance OHADA et agents IA :
              une seule plateforme, bornée à votre périmètre par construction.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Accéder à la plateforme <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/solution"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border border-border text-sm font-medium hover:bg-accent/60 transition-colors"
              >
                Découvrir la solution
              </Link>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Authentification obligatoire · sessions rotatives · 2FA TOTP · comptes de démonstration disponibles.
            </p>
          </div>

          {/* Aperçu cockpit */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-primary/5" aria-hidden>
            <div className="flex items-center justify-between px-1 pb-3">
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground">COCKPIT — IVOIRE DISTRIBUTION</p>
              <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Wallet className="h-3 w-3 text-emerald-400" /> Trésorerie totale</p>
                <p className="mt-1 text-lg font-black">84 250 000</p>
                <p className="text-[9px] text-muted-foreground">FCFA · 6 comptes actifs</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><TrendingUp className="h-3 w-3 text-amber-400" /> Créances clients</p>
                <p className="mt-1 text-lg font-black">12 480 000</p>
                <p className="text-[9px] text-muted-foreground">dont 2,1 M en retard</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Landmark className="h-3 w-3 text-red-400" /> Dettes à régler</p>
                <p className="mt-1 text-lg font-black">7 940 000</p>
                <p className="text-[9px] text-muted-foreground">dépenses non soldées</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><FileText className="h-3 w-3 text-primary" /> TVA nette estimée</p>
                <p className="mt-1 text-lg font-black">3 118 000</p>
                <p className="text-[9px] text-muted-foreground">collectée · récupérable</p>
              </div>
            </div>
            <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
              <BellRing className="h-3.5 w-3.5 text-amber-400 mt-0.5" />
              <p className="text-[10px] text-amber-200 leading-relaxed">
                3 factures clients échues à plus de 30 jours — relance recommandée avant clôture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Chiffres clés ── */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-black text-primary">{s.valeur}</p>
              <p className="text-xs font-semibold mt-1">{s.label}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{s.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Modules ── */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <p className="text-[11px] font-bold tracking-widest text-primary">LA PLATEFORME</p>
          <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">Six modules, un seul système</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Chaque module partage les mêmes données, les mêmes rôles et le même journal d&apos;audit.
            Aucun export manuel, aucune ressaisie : la décision et l&apos;exécution vivent au même endroit.
          </p>
          <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULES.map((m) => {
              const Icon = MODULE_ICONS[m.id] ?? Layers
              return (
                <div key={m.id} className="group rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <h3 className="mt-3 text-sm font-bold">{m.titre}</h3>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{m.description}</p>
                  <ul className="mt-3 space-y-1">
                    {m.points.map((pt) => (
                      <li key={pt} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary mt-px">▸</span> {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
          <div className="mt-6">
            <Link href="/solution" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
              Explorer la solution en détail <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Pays ── */}
      <section className="border-b border-border/60 bg-sidebar/30">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold tracking-widest text-primary">COUVERTURE</p>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">Trois marchés nationaux, une isolation totale</h2>
            </div>
            <Link href="/pays" className="text-xs font-semibold text-primary hover:underline">Voir les Country Packs</Link>
          </div>
          <div className="mt-8 grid md:grid-cols-3 gap-4">
            {COUNTRY_PACKS.map((c) => (
              <div key={c.code} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <p className="text-2xl">{c.drapeau}</p>
                  <span className="text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-2 py-0.5">{c.statut}</span>
                </div>
                <h3 className="mt-3 text-sm font-bold">{c.nom}</h3>
                <p className="text-[11px] text-muted-foreground">{c.ville} · {c.devise}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.rails.map((r) => (
                    <span key={r} className="text-[10px] rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">{r}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dernières annonces ── */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary"><Megaphone className="h-3.5 w-3.5" /> ANNONCES</p>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">Dernières actualités</h2>
            </div>
            <Link href="/annonces" className="text-xs font-semibold text-primary hover:underline">Toutes les annonces</Link>
          </div>
          <div className="mt-8 grid md:grid-cols-3 gap-4">
            {annonces.map((a) => (
              <Link key={a.slug} href="/annonces" className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors block">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-primary border border-primary/30 bg-primary/10 rounded-full px-2 py-0.5">
                    {CATEGORIE_LABELS[a.categorie]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(a.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-bold leading-snug">{a.titre}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-3">{a.extrait}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section>
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 md:p-12 text-center">
            <Globe2 className="h-8 w-8 text-primary mx-auto" aria-hidden />
            <h2 className="mt-4 text-2xl md:text-3xl font-bold tracking-tight">Prêt à gouverner votre croissance ?</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Connectez-vous à la plateforme avec un compte de démonstration et explorez le Cockpit,
              les paiements sous policy, la finance OHADA et la Gouvernance — en conditions réelles.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Se connecter à la plateforme <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/contacts"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg border border-border text-sm font-medium hover:bg-accent/60 transition-colors"
              >
                Demander une démonstration
              </Link>
            </div>
          </div>
        </div>
      </section>
    </VitrineShell>
  )
}
