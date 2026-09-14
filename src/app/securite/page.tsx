import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Lock, KeyRound, FileLock2, ShieldCheck, ScrollText } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'

export const metadata: Metadata = {
  title: 'Sécurité — YAHRIA BUSINESS OS',
  description:
    '6 invariants PAR CONSTRUCTION, RLS applicatif, sessions rotatives avec détection de rejeu, 2FA TOTP obligatoire, chaîne d\u2019Evidence signée HMAC-SHA256.',
}

const INVARIANTS = [
  { code: 'INV-001', nom: 'Isolation tenant', detail: 'Toute requête est bornée à son périmètre {tenant, org}. Une lecture cross-tenant est refusée — sonde runtime à l\u2019appui.' },
  { code: 'INV-002', nom: 'Authorization', detail: 'Matrice RBAC à 6 rôles, vérifiée à l\u2019entrée de chaque route API + middleware edge. Aucune route sans garde.' },
  { code: 'INV-007', nom: 'Immutabilité des événements', detail: 'Audit et Evidence refusent update/delete en base de pile. Chaîne HMAC-SHA256 : falsifier une preuve casse la chaîne.' },
  { code: 'INV-011', nom: 'Isolation pays', detail: 'Un rail de paiement étranger au marché national est refusé avant exécution — DENY + preuve + audit.' },
  { code: 'INV-012', nom: 'Isolation sectorielle', detail: 'Le cœur ne dépend jamais d\u2019une extension sectorielle ; l\u2019extension n\u2019importe que son contrat. Scans de frontières.' },
  { code: 'INV-013', nom: 'Versionnage des contrats', detail: 'API, Evidence, packs et secteurs sous semver. Chaque réponse porte sa version — aucune rupture silencieuse.' },
]

const COUCHES = [
  {
    icone: Lock, titre: 'Accès & sessions',
    items: [
      'Sessions opaques rotatives en base — pas de JWT interprétable côté client',
      'TTL glissant 7 jours + plafond absolu 30 jours',
      'Détection de rejeu : un token rotaté réutilisé révoque toute la famille',
      'Liste des sessions par appareil, révocation unitaire ou globale',
    ],
  },
  {
    icone: KeyRound, titre: 'Authentification forte',
    items: [
      '2FA TOTP (RFC 6238) obligatoire, déployée par vagues de rôles',
      'Enrôlement QR + 8 codes de récupération à usage unique',
      'Mur structurel : aucun accès métier sans enrôlement pour les vagues actives',
      'Mots de passe scrypt à sel aléatoire',
    ],
  },
  {
    icone: FileLock2, titre: 'Données & preuves',
    items: [
      'RLS applicatif : chaque requête SQL porte son périmètre',
      'Evidence signées HMAC-SHA256, chaînées par organisation',
      'Journal d\u2019audit immuable : connexions, décisions, invariants, exports',
      'Contrats publics versionnés (semver) exposés dans chaque réponse',
    ],
  },
]

export default function SecuritePage() {
  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> SÉCURITÉ
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight max-w-3xl">
            La sécurité n&apos;est pas une option : c&apos;est la structure
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            La plupart des plateformes promettent la sécurité « par configuration ».
            YAHRIA BUSINESS OS la garantit PAR CONSTRUCTION : les règles critiques sont
            codées dans la structure du système, et chaque invariant dispose d&apos;une sonde
            runtime qui prouve qu&apos;il tient — attaque réelle à l&apos;appui.
          </p>
        </div>
      </section>

      {/* Invariants */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Les six invariants fondateurs</h2>
          <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {INVARIANTS.map((inv) => (
              <div key={inv.code} className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] font-bold text-primary">{inv.code}</p>
                  <span className="text-[9px] font-black tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-2 py-0.5">
                    PAR CONSTRUCTION
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-bold">{inv.nom}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{inv.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Couches */}
      <section className="border-b border-border/60 bg-sidebar/30">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Trois couches de défense</h2>
          <div className="mt-8 grid md:grid-cols-3 gap-4">
            {COUCHES.map((c) => (
              <div key={c.titre} className="rounded-xl border border-border bg-card p-6">
                <span className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <c.icone className="h-5 w-5 text-primary" />
                </span>
                <h3 className="mt-3 text-sm font-bold">{c.titre}</h3>
                <ul className="mt-3 space-y-2">
                  {c.items.map((it) => (
                    <li key={it} className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                      <span className="text-primary mt-px shrink-0">▸</span> {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preuves exécutables */}
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary">
              <ScrollText className="h-3.5 w-3.5" /> PREUVES EXÉCUTABLES
            </p>
            <h2 className="mt-2 text-xl md:text-2xl font-bold tracking-tight">Ne nous croyez pas : exécutez les preuves</h2>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              L&apos;onglet Gouvernance de la plateforme embarque un bouton « Exécuter les
              preuves » : lecture cross-tenant refusée, falsification d&apos;Evidence rejetée,
              rail étranger en DENY, frontières d&apos;imports scannées… Six sondes, un verdict
              unique : PASS ou FAIL, sous vos yeux.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 font-mono text-[11px] space-y-2" aria-hidden>
            <p className="text-muted-foreground">$ INVARIANT_PROOFS_RUN</p>
            {['INV-001 tenant isolation', 'INV-002 authorization', 'INV-007 evidence immutability', 'INV-011 country isolation', 'INV-012 sector isolation', 'INV-013 contract versioning'].map((s) => (
              <p key={s} className="flex justify-between"><span>{s}</span><span className="text-emerald-400">PASS ✓</span></p>
            ))}
            <p className="flex justify-between border-t border-border pt-2 font-bold"><span>CONSTRUCTION PROOF</span><span className="text-emerald-400">6/6 PASS</span></p>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Testez la sécurité en conditions réelles</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
            Les comptes de démonstration franchissent le mur 2FA en quelques clics — le code courant est affiché en mode démo.
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
