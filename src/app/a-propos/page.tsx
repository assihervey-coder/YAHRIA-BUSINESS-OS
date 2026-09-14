import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Target, Eye, Handshake, Building2 } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'

export const metadata: Metadata = {
  title: 'À propos — YAHRIA BUSINESS OS',
  description:
    'La mission de YAHRIA : donner aux entreprises africaines un système d\u2019exploitation gouverné. Approche, valeurs, présence à Abidjan, Dakar et Cotonou.',
}

const VALEURS = [
  {
    icone: Target, titre: 'La preuve plutôt que la promesse',
    detail:
      'Chaque garantie architecturale doit être exécutable : nos six invariants sont prouvés par des sondes runtime que n\u2019importe quel utilisateur peut déclencher depuis la Gouvernance.',
  },
  {
    icone: Eye, titre: 'La transparence gouvernée',
    detail:
      'Une décision qui laisse des traces signées est une décision qu\u2019on peut défendre. Evidence, audit immuable et contrats versionnés rendent le système lisible par tous.',
  },
  {
    icone: Handshake, titre: 'La séparation des pouvoirs',
    detail:
      'Celui qui saisit n\u2019approuve pas ; celui qui approuve n\u2019exécute pas ; celui qui audite voit tout mais ne touche rien. Structurellement, pas par charte.',
  },
]

const JALONS = [
  { date: '2026 · Avril', titre: 'Lancement V1', detail: 'Cockpit, Core, Money, Finance, Graphe, Agents — le socle multi-tenant est publié.' },
  { date: '2026 · Mai', titre: 'Country Pack Côte d\u2019Ivoire', detail: 'Premier marché national : rails Orange Money, MTN, Moov, Wave.' },
  { date: '2026 · Juin', titre: '6 invariants PAR CONSTRUCTION', detail: 'Les garanties critiques deviennent structurelles et prouvables en runtime.' },
  { date: '2026 · Juillet', titre: 'Sessions rotatives + exports SYSCOHADA', detail: 'Détection de rejeu, révocation familiale ; balance, grand livre, journaux PDF/Excel.' },
  { date: '2026 · Août', titre: 'Country Packs Sénégal & Bénin', detail: 'Trois marchés nationaux isolés, INV-011 vérifié en runtime.' },
  { date: '2026 · Septembre', titre: 'Baseline 1.2.0 — 2FA par vagues', detail: 'Verrou TOTP structurel sur l\u2019ensemble des rôles, assistance démo incluse.' },
]

export default function AProposPage() {
  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="text-[11px] font-bold tracking-widest text-primary">À PROPOS</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight max-w-3xl">
            Nous construisons l&apos;infrastructure de décision des entreprises africaines
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            YAHRIA est née d&apos;un audit sans complaisance des systèmes d&apos;information
            de PME africaines : des données dispersées, des décisions sans traces, des
            promesses de sécurité non vérifiables. Notre réponse est un système
            d&apos;exploitation complet — gouverné par construction, pas par promesse.
          </p>
        </div>
      </section>

      {/* Valeurs */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Ce qui nous tient</h2>
          <div className="mt-8 grid md:grid-cols-3 gap-4">
            {VALEURS.map((v) => (
              <div key={v.titre} className="rounded-xl border border-border bg-card p-6">
                <span className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <v.icone className="h-5 w-5 text-primary" />
                </span>
                <h3 className="mt-3 text-sm font-bold">{v.titre}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{v.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Jalons */}
      <section className="border-b border-border/60 bg-sidebar/30">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Le chemin parcouru</h2>
          <div className="mt-8 relative border-l border-border ml-3 space-y-6 pl-6">
            {JALONS.map((j) => (
              <div key={j.titre} className="relative">
                <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" aria-hidden />
                <p className="text-[11px] font-bold text-primary">{j.date}</p>
                <h3 className="mt-0.5 text-sm font-bold">{j.titre}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-2xl">{j.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Présence */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="flex items-center gap-2 text-xl md:text-2xl font-bold tracking-tight">
            <Building2 className="h-5 w-5 text-primary" /> Une équipe ancrée sur trois marchés
          </h2>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Produit et ingénierie à Abidjan, expansion commerciale à Dakar, support
            régional à Cotonou. Nous recrutons activement — ingénieurs plateforme et
            experts comptables OHADA — pour accélérer le déploiement des prochains packs.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/contacts" className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              Nous écrire <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/annonces" className="inline-flex items-center gap-2 h-10 px-5 rounded-lg border border-border text-sm font-medium hover:bg-accent/60 transition-colors">
              Voir nos annonces
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Rejoignez le système</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
            La plateforme est ouverte : connectez-vous avec un compte de démonstration et explorez.
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
