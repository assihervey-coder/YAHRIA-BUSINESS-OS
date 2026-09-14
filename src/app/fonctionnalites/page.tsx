import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Gauge, Landmark, ShieldCheck, Users, Workflow, FileText } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'
import { FEATURE_GROUPS } from '@/lib/vitrine/content'

export const metadata: Metadata = {
  title: 'Fonctionnalités — YAHRIA BUSINESS OS',
  description:
    'KPI temps réel, paiements Mobile Money sous policy, exports SYSCOHADA, sessions rotatives, 2FA, RBAC 6 rôles, agents IA gouvernés : le détail des fonctionnalités.',
}

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  gauge: Gauge, landmark: Landmark, shield: ShieldCheck, users: Users, workflow: Workflow, file: FileText,
}

export default function FonctionnalitesPage() {
  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="text-[11px] font-bold tracking-widest text-primary">FONCTIONNALITÉS</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight max-w-3xl">
            Tout ce que le système sait faire — et prouver
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Chaque fonctionnalité ci-dessous est livrée dans la V1 et vérifiable dans la
            plateforme : la Gouvernance embarque même des sondes runtime qui exécutent les
            preuves sous vos yeux.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14 space-y-10">
          {FEATURE_GROUPS.map((g) => {
            const Icon = GROUP_ICONS[g.icone] ?? Gauge
            return (
              <div key={g.titre}>
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <h2 className="text-lg font-bold tracking-tight">{g.titre}</h2>
                </div>
                <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {g.items.map((it) => (
                    <div key={it.nom} className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
                      <p className="text-sm font-semibold">{it.nom}</p>
                      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{it.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-4 py-14 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Comparez les formules</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Trois plans, du démarrage au multi-tenant régulé.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/tarifs" className="inline-flex items-center gap-2 h-10 px-5 rounded-lg border border-border text-sm font-medium hover:bg-accent/60 transition-colors">
              Voir les tarifs
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              Accéder à la plateforme <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </VitrineShell>
  )
}
