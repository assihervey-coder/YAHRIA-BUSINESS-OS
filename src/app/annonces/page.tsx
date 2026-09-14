import type { Metadata } from 'next'
import { Megaphone } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'
import { ANNONCES, CATEGORIE_LABELS } from '@/lib/vitrine/content'

export const metadata: Metadata = {
  title: 'Annonces — YAHRIA BUSINESS OS',
  description:
    'Actualités officielles : lancements de Country Packs, baselines produit, annonces sécurité, événements et recrutement.',
}

const CATEGORIE_STYLE: Record<string, string> = {
  PRODUIT: 'text-primary border-primary/30 bg-primary/10',
  PAYS: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  SECURITE: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  ENTREPRISE: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  EVENEMENT: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function AnnoncesPage() {
  const triees = [...ANNONCES].sort((a, b) => b.date.localeCompare(a.date))
  const [une, ...reste] = triees

  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary">
            <Megaphone className="h-3.5 w-3.5" /> ANNONCES
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">
            Le fil officiel de la plateforme
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Lancements, baselines, sécurité, pays et vie de l&apos;entreprise : tout ce qui
            change dans YAHRIA BUSINESS OS est annoncé ici, avec le détail de ce que ça
            change pour vous.
          </p>
        </div>
      </section>

      {/* À la une */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <article className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`text-[10px] font-semibold border rounded-full px-2.5 py-0.5 ${CATEGORIE_STYLE[une.categorie]}`}>
                {CATEGORIE_LABELS[une.categorie]}
              </span>
              <span className="text-[11px] text-muted-foreground">{formatDate(une.date)}</span>
              <span className="text-[10px] font-bold tracking-wider text-primary">À LA UNE</span>
            </div>
            <h2 className="mt-4 text-xl md:text-2xl font-bold tracking-tight leading-snug">{une.titre}</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-3xl">{une.extrait}</p>
            <div className="mt-4 space-y-2.5 max-w-3xl">
              {une.contenu.map((p, i) => (
                <p key={i} className="text-xs text-muted-foreground leading-relaxed">{p}</p>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* Fil complet */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-lg font-bold tracking-tight">Toutes les annonces</h2>
          <div className="mt-6 space-y-4">
            {reste.map((a) => (
              <article key={a.slug} className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className={`text-[10px] font-semibold border rounded-full px-2.5 py-0.5 ${CATEGORIE_STYLE[a.categorie]}`}>
                    {CATEGORIE_LABELS[a.categorie]}
                  </span>
                  <time dateTime={a.date} className="text-[11px] text-muted-foreground">{formatDate(a.date)}</time>
                </div>
                <h3 className="mt-3 text-sm md:text-base font-bold leading-snug">{a.titre}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{a.extrait}</p>
                <details className="group mt-3">
                  <summary className="cursor-pointer text-[11px] font-semibold text-primary list-none inline-flex items-center gap-1">
                    Lire l&apos;annonce <span className="group-open:rotate-90 transition-transform">▸</span>
                  </summary>
                  <div className="mt-3 space-y-2 border-l-2 border-primary/20 pl-4">
                    {a.contenu.map((p, i) => (
                      <p key={i} className="text-xs text-muted-foreground leading-relaxed">{p}</p>
                    ))}
                  </div>
                </details>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-4 py-12 text-center text-sm text-muted-foreground">
          Une question sur une annonce ? Écrivez-nous depuis la page <a href="/contacts" className="text-primary font-semibold hover:underline">Contacts</a>.
        </div>
      </section>
    </VitrineShell>
  )
}
