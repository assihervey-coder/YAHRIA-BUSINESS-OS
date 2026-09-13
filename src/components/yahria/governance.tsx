'use client'

// YAHRIA BUSINESS OS V1 — 99_GOVERNANCE view (policies, invariants, audit, evidence)
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge, SectionTitle, fmtDateTime } from './ui'
import { useToast } from '@/hooks/use-toast'
import { ShieldCheck, ScrollText, Fingerprint, Scale } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Policy { id: string; code: string; name: string; category: string; description: string; active: boolean; version: number; rule: Record<string, unknown> }
interface Invariant { id: string; name: string; desc: string; check: string; checkResult: { status: string; detail: string } | null }
interface AuditRow { id: string; ts: string; traceId: string; actorType: string; actorName: string; action: string; resourceType: string; summary: string }
interface EvidenceRow { id: string; ref: string; kind: string; title: string; hash: string; createdAt: string; payload: Record<string, unknown> }

export function GovernanceView() {
  const { toast } = useToast()
  const [data, setData] = useState<{ policies: Policy[]; invariants: Invariant[]; audit: AuditRow[]; evidence: EvidenceRow[]; stats: { auditCount: number; evidenceCount: number; policyCount: number } } | null>(null)

  const load = useCallback(() => {
    fetch('/api/v1/governance').then((r) => r.json()).then(setData)
  }, [])
  useEffect(load, [load])

  async function togglePolicy(code: string) {
    await fetch('/api/v1/governance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'TOGGLE_POLICY', code }) })
    toast({ title: 'Politique modifiée', description: 'Changement versionné — les décisions déjà exécutées ne sont pas rétroactivement modifiées (INV-POL-004).' })
    load()
  }

  if (!data) return <div className="space-y-3"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>

  return (
    <div className="space-y-5">
      <SectionTitle
        title="GOVERNANCE — le système qui contrôle le système"
        desc="Policy Engine versionné, 15 invariants globaux vérifiés en continu, audit immuable et Evidence hashée : aucun acteur — humain, agent ou IA — ne contourne cette couche."
      />

      <Tabs defaultValue="invariants">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invariants">Invariants</TabsTrigger>
          <TabsTrigger value="policies">Policies ({data.stats.policyCount})</TabsTrigger>
          <TabsTrigger value="audit">Audit ({data.stats.auditCount})</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({data.stats.evidenceCount})</TabsTrigger>
        </TabsList>

        {/* ── INVARIANTS ── */}
        <TabsContent value="invariants" className="mt-4">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.invariants.map((inv) => (
              <Card key={inv.id} className={inv.checkResult?.status === 'FAIL' ? 'border-red-500/60' : ''}>
                <CardContent className="pt-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{inv.id}</span>
                    {inv.checkResult ? <StatusBadge status={inv.checkResult.status} /> : <Badge variant="outline" className="text-[10px] text-muted-foreground">PAR CONSTRUCTION</Badge>}
                  </div>
                  <p className="text-sm font-semibold">{inv.name}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{inv.desc}</p>
                  {inv.checkResult && <p className="text-[11px] leading-snug pt-1 border-t border-border/60 text-muted-foreground">{inv.checkResult.detail}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── POLICIES ── */}
        <TabsContent value="policies" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Code</TableHead><TableHead>Nom</TableHead><TableHead>Catégorie</TableHead>
                      <TableHead>Règles</TableHead><TableHead>v</TableHead><TableHead className="w-20">Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.policies.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.code}</TableCell>
                        <TableCell className="text-sm"><span className="font-medium">{p.name}</span><br /><span className="text-xs text-muted-foreground">{p.description}</span></TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{p.category}</Badge></TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[220px] truncate">{JSON.stringify(p.rule)}</TableCell>
                        <TableCell className="text-xs">v{p.version}</TableCell>
                        <TableCell><Switch checked={p.active} onCheckedChange={() => togglePolicy(p.code)} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AUDIT ── */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><ScrollText className="h-4 w-4" /> Journal immuable (append-only, lecture seule)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden max-h-[34rem] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="w-28">Horodatage</TableHead><TableHead className="w-32">Trace</TableHead><TableHead className="w-36">Acteur</TableHead><TableHead>Sommaire</TableHead><TableHead className="w-36">Ressource</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDateTime(a.ts)}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{a.traceId.slice(0, 12)}</TableCell>
                        <TableCell><StatusBadge status={a.actorType} /><span className="block text-[10px] text-muted-foreground mt-0.5">{a.actorName}</span></TableCell>
                        <TableCell className="text-xs">{a.summary}</TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground">{a.resourceType}<br />{a.action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EVIDENCE ── */}
        <TabsContent value="evidence" className="mt-4">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.evidence.map((e) => (
              <Card key={e.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">{e.ref}</span>
                    <Badge variant="outline" className="text-[10px]">{e.kind}</Badge>
                  </div>
                  <p className="text-sm font-medium leading-snug">{e.title}</p>
                  <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1"><Fingerprint className="h-3 w-3" />hash {e.hash} · {fmtDateTime(e.createdAt)}</p>
                  <details className="text-xs group">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Payload & provenance</summary>
                    <pre className="mt-1.5 rounded-md border bg-accent/20 p-2 text-[10px] overflow-x-auto whitespace-pre-wrap">{JSON.stringify(e.payload, null, 1)}</pre>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Card className="border-primary/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Scale className="h-4 w-4" /> Ordre de vérité (final implementation law)</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground leading-relaxed">
          GOUVERNANCE → ARCHITECTURE → DEPENDENCY GRAPH → CONTRATS → INVARIANTS → MANIFESTE D'IMPLÉMENTATION → <span className="text-foreground font-medium">CODE</span> → TESTS → EVIDENCE → ACCEPTANCE.
          Toute implémentation qui contredit un artefact supérieur est invalide.
        </CardContent>
      </Card>
    </div>
  )
}
