import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'

export const metadata: Metadata = {
  title: 'Secteurs — YAHRIA BUSINESS OS',
  description:
    '13 extensions sectorielles auto-contenues : BTP, commerce, santé, éducation, microfinance, e-commerce… Le cœur de la plateforme ne dépend jamais d\u2019une extension.',
}

// Les 13 extensions du registre sectoriel réel (src/lib/yahria/sectors/extensions.ts)
const SECTEURS = [
  { code: 'construction', nom: 'BTP & Construction', detail: 'Situations de travaux, rétention de garantie, sous-traitance et attachements — vérifiés à chaque paiement.' },
  { code: 'retail', nom: 'Commerce de détail', detail: 'Rotation des stocks, saisonnalité des encaissements et contrôle des écarts de caisse.' },
  { code: 'ecommerce', nom: 'E-commerce', detail: 'Réconciliation passerelles de paiement, litiges, remboursements et ventes à l\u2019international.' },
  { code: 'restaurant', nom: 'Restauration', detail: 'Cash quotidien, ratios matière et traçabilité des approvisionnements frais.' },
  { code: 'healthcare', nom: 'Santé', detail: 'Conformité réglementaire, circuit patients-factures et traçabilité des actes.' },
  { code: 'education', nom: 'Éducation', detail: 'Scolarité échelonnée, bourses et rapprochement effectifs / encaissements.' },
  { code: 'microfinance', nom: 'Microfinance', detail: 'Portefeuille de crédits, impayés, provisionnement et discipline de remboursement.' },
  { code: 'money_transfer', nom: 'Transfert d\u2019argent', detail: 'Plafonds, détection de structuration et conformité LBC-FT sur les flux.' },
  { code: 'industry', nom: 'Industrie', detail: 'Coûts de production, encours ateliers et marge par ligne de fabrication.' },
  { code: 'travel', nom: 'Voyages', detail: 'Acomptes fournisseurs, devises et réconciliation billetterie.' },
  { code: 'toll', nom: 'Péage', detail: 'Flux véhicules à fort volume, réconciliation journalière et audits de trafic.' },
  { code: 'ngo', nom: 'ONG', detail: 'Financements par projet, traçabilité des dons et reporting bailleurs.' },
  { code: 'enterprise', nom: 'Entreprise générale', detail: 'Le socle transversal : achats, ventes, trésorerie et reporting standard.' },
]

export default function SecteursPage() {
  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="text-[11px] font-bold tracking-widest text-primary">SECTEURS</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight max-w-3xl">
            13 extensions sectorielles, un cœur intact
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Chaque secteur est une extension auto-contenue et versionnée : elle enrichit la
            vérification des paiements de ses constats propres, sans jamais modifier le cœur
            de la plateforme. INV-012 garantit par construction cette frontière — le Core
            n&apos;importe aucune extension, l&apos;extension n&apos;importe que son contrat.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SECTEURS.map((s) => (
              <div key={s.code} className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">{s.nom}</h2>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-label="Extension active" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{s.detail}</p>
                <p className="mt-3 font-mono text-[10px] text-muted-foreground/70">sectorCode: {s.code} · v1.0.0</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="border-b border-border/60 bg-sidebar/30">
        <div className="max-w-6xl mx-auto px-4 py-14 grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">Comment une extension sectorielle travaille</h2>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              À chaque paiement, la plateforme interroge l&apos;extension du secteur de
              l&apos;organisation AVANT l&apos;exécution. L&apos;extension analyse le contexte
              (montant, rail, référentiels, historique) et produit des constats signés.
            </p>
          </div>
          <ol className="space-y-3 text-sm">
            {[
              'Le paiement arrive : policy générale vérifiée (rôle, plafonds, rails autorisés).',
              'L\u2019extension sectorielle évalue le contexte et attache ses constats (findings).',
              'La décision est rendue : ALLOW, REVIEW (constats consultatifs) ou DENY (rail interdit).',
              'Une Evidence signée scelle décision + constats, chaînée à l\u2019historique de l\u2019organisation.',
            ].map((t, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                <span className="h-6 w-6 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-black flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Votre secteur est déjà couvert</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
            Connectez-vous et exécutez le test d&apos;isolation sectorielle depuis l&apos;onglet Gouvernance.
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
