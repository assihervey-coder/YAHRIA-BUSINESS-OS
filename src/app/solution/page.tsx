import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Database, BrainCircuit, Scale, Zap, FileCheck2 } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'
import { MODULES } from '@/lib/vitrine/content'

export const metadata: Metadata = {
  title: 'Solution — YAHRIA BUSINESS OS',
  description:
    'Une chaîne de valeur complète : Données → Intelligence → Décision → Exécution → Evidence. Six modules intégrés, gouvernance par construction.',
}

const CHAINE = [
  { icone: Database, titre: 'Données', detail: 'Clients, fournisseurs, factures, dépenses et paiements structurés dans un Core unique, multi-tenant.' },
  { icone: BrainCircuit, titre: 'Intelligence', detail: 'Graphe relationnel, KPI consolidés et constats sectoriels calculés depuis vos données réelles.' },
  { icone: Scale, titre: 'Décision', detail: 'Policy, permissions RBAC et extensions sectorielles arbitrent chaque opération : ALLOW, REVIEW ou DENY.' },
  { icone: Zap, titre: 'Exécution', detail: 'Agents IA à périmètre borné et workflows de paiement exécutent les décisions, sans jamais les contourner.' },
  { icone: FileCheck2, titre: 'Evidence', detail: 'Chaque étape produit une preuve signée HMAC-SHA256, chaînée par organisation et auditable.' },
]

export default function SolutionPage() {
  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="text-[11px] font-bold tracking-widest text-primary">SOLUTION</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight max-w-3xl">
            Une chaîne de valeur complète, de la donnée à la preuve
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            La plupart des outils automatisent une étape et laissent le reste aux tableurs.
            YAHRIA BUSINESS OS couvre la chaîne entière — et garantit par construction que
            chaque décision reste dans votre périmètre, vos rôles et vos règles.
          </p>
        </div>
      </section>

      {/* Chaîne de valeur */}
      <section className="border-b border-border/60 bg-sidebar/30">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Le pipeline gouverné</h2>
          <div className="mt-8 grid md:grid-cols-5 gap-3">
            {CHAINE.map((e, i) => (
              <div key={e.titre} className="relative rounded-xl border border-border bg-card p-4">
                <span className="absolute -top-2.5 -left-2.5 h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-black flex items-center justify-center">
                  {i + 1}
                </span>
                <e.icone className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-2.5 text-sm font-bold">{e.titre}</h3>
                <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{e.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules détaillés */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Les six modules</h2>
          <div className="mt-8 space-y-4">
            {MODULES.map((m, i) => (
              <div key={m.id} className={`grid md:grid-cols-[280px_1fr] gap-4 rounded-xl border border-border bg-card p-6 ${i % 2 === 1 ? 'md:bg-sidebar/40' : ''}`}>
                <div>
                  <p className="font-mono text-[10px] text-muted-foreground">MODULE {String(i + 1).padStart(2, '0')}</p>
                  <h3 className="mt-1 text-lg font-bold">{m.titre}</h3>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{m.description}</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {m.points.map((pt) => (
                      <li key={pt} className="text-[11px] rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">✓ {pt}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-6xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Voyez la plateforme en conditions réelles</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
            Trois tenants de démonstration, dix comptes, six rôles : connectez-vous et parcourez le système de bout en bout.
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
