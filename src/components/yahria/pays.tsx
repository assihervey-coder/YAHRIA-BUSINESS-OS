'use client'

// YAHRIA BUSINESS OS V1 — 06_SECTOR_ENGINES + 07_COUNTRY_PACKS view
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, SectionTitle, fcfa } from './ui'
import { Globe2, Blocks, Building2, Smartphone, Scale, ReceiptText, Users } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Provider { provider: string; label: string; feePct?: number; transferFee?: number; maxTx?: number; active: boolean }
interface Pack {
  id: string; code: string; name: string; currency: string; vatRate: number; version: string; active: boolean
  mobileMoney: Provider[]; banks: Provider[]
  payroll: Record<string, unknown>; compliance: Record<string, unknown>; invoicing: Record<string, unknown>
}
interface Sector { id: string; code: string; name: string; description: string; status: string; entities: string[]; kpis: string[]; workflows: string[] }

export function PaysSecteursView() {
  const [meta, setMeta] = useState<{ countryPacks: Pack[]; sectorEngines: Sector[] } | null>(null)

  useEffect(() => {
    fetch('/api/v1/meta').then((r) => r.json()).then((d) => setMeta({ countryPacks: d.countryPacks ?? [], sectorEngines: d.sectorEngines ?? [] }))
  }, [])

  if (!meta) return <div className="space-y-3"><Skeleton className="h-48" /><Skeleton className="h-64" /></div>

  return (
    <div className="space-y-6">
      <SectionTitle
        title="COUNTRY PACKS & SECTOR ENGINES"
        desc="La logique nationale est encapsulée (INV-011) et les secteurs sont des extensions métier qui ne contaminent jamais le Core (INV-012). Le même produit opère différemment selon le pays, sans dupliquer le noyau."
      />

      {/* ── COUNTRY PACKS ── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Globe2 className="h-4 w-4 text-primary" /> Country Packs actifs</h3>
        <div className="grid lg:grid-cols-2 gap-4">
          {meta.countryPacks.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-lg">{p.code === 'CI' ? '🇨🇮' : '🇸🇳'}</span>
                  {p.name} <Badge variant="outline" className="font-mono text-[10px]">{p.code}</Badge>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">v{p.version}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md border px-2 py-1.5"><p className="text-[10px] text-muted-foreground">Devise</p><p className="font-semibold">{p.currency}</p></div>
                  <div className="rounded-md border px-2 py-1.5"><p className="text-[10px] text-muted-foreground">TVA</p><p className="font-semibold">{Math.round(p.vatRate * 100)} %</p></div>
                  <div className="rounded-md border px-2 py-1.5"><p className="text-[10px] text-muted-foreground">Socle</p><p className="font-semibold text-xs leading-5">SYSCOHADA</p></div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5"><Smartphone className="h-3 w-3" /> Mobile Money (routage paiements)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.mobileMoney.map((m) => (
                      <span key={m.provider} className={`text-xs rounded-full border px-2 py-0.5 ${m.active ? 'border-emerald-500/40 text-emerald-300' : 'border-border text-muted-foreground line-through'}`}>
                        {m.label} {m.feePct != null && <span className="text-muted-foreground">· {(m.feePct * 100).toFixed(1)} %</span>} {m.maxTx != null && <span className="text-muted-foreground">· max {fcfa(m.maxTx)}</span>}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Banques</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.banks.map((b) => (
                      <span key={b.provider} className="text-xs rounded-full border border-border px-2 py-0.5">{b.label} · {fcfa(b.transferFee ?? 0)}</span>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 pt-1">
                  <div className="rounded-md border p-2.5 space-y-1 text-xs">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Users className="h-3 w-3" /> Paie</p>
                    {Object.entries(p.payroll).map(([k, v]) => <p key={k}><span className="text-muted-foreground">{k} :</span> <span className="font-medium">{String(v)}</span></p>)}
                  </div>
                  <div className="rounded-md border p-2.5 space-y-1 text-xs">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Scale className="h-3 w-3" /> Conformité</p>
                    {Object.entries(p.compliance).map(([k, v]) => <p key={k}><span className="text-muted-foreground">{k} :</span> <span className="font-medium">{String(v)}</span></p>)}
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border/60">
                  <ReceiptText className="h-3 w-3" />
                  Facturation : {(p.invoicing as { vatLabel?: string }).vatLabel} — mentions {((p.invoicing as { mentions?: string[] }).mentions ?? []).join(', ')} — {(p.invoicing as { currencyLabel?: string }).currencyLabel}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── SECTOR ENGINES ── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Blocks className="h-4 w-4 text-primary" /> Sector Engines — extensions métier</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {meta.sectorEngines.map((s) => (
            <Card key={s.id} className={s.status === 'AVAILABLE' ? 'border-primary/30' : 'opacity-75'}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">{s.name}</p>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                <p className="text-[10px] font-mono text-muted-foreground">sectors/{s.code} · manifest + domain + workflows + kpis</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
