'use client'

// YAHRIA BUSINESS OS V1 — 99_GOVERNANCE view (policies, invariants, audit, evidence)
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge, SectionTitle, LoadError, fmtDateTime } from './ui'
import { apiJson, ApiFail, isAuthLoss, toApiFail } from '@/lib/yahria/client-api'
import { useToast } from '@/hooks/use-toast'
import { ShieldCheck, ScrollText, Fingerprint, Scale, Lock, KeyRound, Globe2, PlayCircle, Braces, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Policy { id: string; code: string; name: string; category: string; description: string; active: boolean; version: number; rule: Record<string, unknown> }
interface Invariant { id: string; name: string; desc: string; check: string; checkResult: { status: string; detail: string } | null }
interface AuditRow { id: string; ts: string; traceId: string; actorType: string; actorName: string; action: string; resourceType: string; summary: string }
interface EvidenceRow { id: string; ref: string; kind: string; title: string; hash: string; signature: string; prevHash: string; seq: number; algo: string; createdAt: string; payload: Record<string, unknown> }
interface ChainInfo { total: number; valid: number; invalid: number; chainIntact: boolean; brokenAtSeq: number | null; algo: string; brokenRefs: string[]; checkedAt: string }
interface RlsInfo { mode: string; tenantCount: number; orgCount: number; scope: { tenantId: string; orgId: string; role: string }; enforcement: string[] }
interface PermsInfo { role: string; canManagePolicies: boolean; canRebuildGraph: boolean; canTestIsolation: boolean }
interface ProofCheck { label: string; ok: boolean; detail: string }
interface ConstructionProof { id: string; name: string; mode: string; status: string; proof: string; checks: ProofCheck[]; checkedAt: string }
interface ContractInfo { contractId: string; name: string; version: string; semver: boolean; scope: string }
interface ConstructionInfo { allPass: boolean; proofs: ConstructionProof[]; contracts: ContractInfo[] }

export function GovernanceView() {
  const { toast } = useToast()
  const [data, setData] = useState<{ policies: Policy[]; invariants: Invariant[]; audit: AuditRow[]; evidence: EvidenceRow[]; evidenceChain: ChainInfo; rls: RlsInfo; permissions: PermsInfo; construction: ConstructionInfo; stats: { auditCount: number; evidenceCount: number; policyCount: number } } | null>(null)
  const [testing, setTesting] = useState(false)
  const [runningProofs, setRunningProofs] = useState(false)
  const [isoResult, setIsoResult] = useState<{ orgCountry: string; foreignPack: string; results: { rail: string; railLabel: string; allowed: boolean; detail: string }[] } | null>(null)
  const [error, setError] = useState<ApiFail | null>(null)

  const load = useCallback(() => {
    apiJson<NonNullable<typeof data>>('/api/v1/governance')
      .then((d) => { setData(d); setError(null) })
      .catch((e: unknown) => { if (!isAuthLoss(e)) setError(toApiFail(e)) })
  }, [])
  useEffect(load, [load])

  async function togglePolicy(code: string) {
    const res = await fetch('/api/v1/governance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'TOGGLE_POLICY', code }) })
    if (!res.ok) {
      const d = await res.json()
      toast({ title: 'Action refusée', description: d.error })
      return
    }
    toast({ title: 'Politique modifiée', description: 'Changement versionné — les décisions déjà exécutées ne sont pas rétroactivement modifiées (INV-POL-004).' })
    load()
  }

  async function verifyChain() {
    const res = await fetch('/api/v1/governance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'VERIFY_EVIDENCE' }) })
    const d = await res.json()
    if (!res.ok) { toast({ title: 'Vérification refusée', description: d.error }); return }
    toast({
      title: d.chain.chainIntact ? 'Chaîne de preuves INTACTE' : 'CHAÎNE ROMPUE',
      description: `${d.chain.valid}/${d.chain.total} signatures HMAC-SHA256 valides${d.chain.brokenAtSeq ? ' — rupture à la séquence ' + d.chain.brokenAtSeq : ''}`,
    })
    load()
  }

  async function testIsolation() {
    setTesting(true)
    const res = await fetch('/api/v1/governance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'TEST_PACK_ISOLATION' }) })
    const d = await res.json()
    setTesting(false)
    if (!res.ok) { toast({ title: 'Test refusé', description: d.error }); return }
    setIsoResult(d)
    toast({ title: 'Test INV-011 exécuté', description: 'Rail étranger → DENY · rail national → ALLOW (audit enregistré).' })
    load()
  }

  async function runProofs() {
    setRunningProofs(true)
    const res = await fetch('/api/v1/governance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'RUN_INVARIANT_PROOFS' }) })
    const d = await res.json()
    setRunningProofs(false)
    if (!res.ok) { toast({ title: 'Exécution refusée', description: d.error }); return }
    const passed = (d.proofs ?? []).filter((p: ConstructionProof) => p.status === 'PASS').length
    toast({
      title: d.allPass ? 'Preuves de construction : 6/6 PASS' : `Preuves exécutées : ${passed}/6 PASS`,
      description: d.allPass
        ? 'INV-001 · INV-002 · INV-007 · INV-011 · INV-012 · INV-013 garantis par construction — attaque réelle exécutée et bloquée à chaque sonde.'
        : 'Au moins une sonde a échoué — consulter l’onglet Par construction.',
    })
    load()
  }

  if (error) return <LoadError error={error} onRetry={load} />
  if (!data) return <div className="space-y-3"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>

  const proofOf = (id: string) => data.construction?.proofs?.find((p) => p.id === id) ?? null

  return (
    <div className="space-y-5">
      <SectionTitle
        title="GOVERNANCE — le système qui contrôle le système"
        desc="Policy Engine versionné, 15 invariants globaux vérifiés en continu, audit immuable et Evidence hashée : aucun acteur — humain, agent ou IA — ne contourne cette couche."
      />

      <Tabs defaultValue="invariants">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invariants">Invariants</TabsTrigger>
          <TabsTrigger value="construction">Par construction</TabsTrigger>
          <TabsTrigger value="policies">Policies ({data.stats.policyCount})</TabsTrigger>
          <TabsTrigger value="security">Sécurité — RLS & Signatures</TabsTrigger>
          <TabsTrigger value="audit">Audit ({data.stats.auditCount})</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({data.stats.evidenceCount})</TabsTrigger>
        </TabsList>

        {/* ── INVARIANTS ── */}
        <TabsContent value="invariants" className="mt-4">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.invariants.map((inv) => {
              const proof = inv.check === 'par-construction' ? proofOf(inv.id) : null
              return (
              <Card key={inv.id} className={inv.checkResult?.status === 'FAIL' || proof?.status === 'FAIL' ? 'border-red-500/60' : ''}>
                <CardContent className="pt-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{inv.id}</span>
                    {inv.checkResult ? <StatusBadge status={inv.checkResult.status} /> : proof ? (
                      proof.status === 'PASS'
                        ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px]">PAR CONSTRUCTION · VÉRIFIÉ</Badge>
                        : <Badge className="bg-red-500/15 text-red-400 border-red-500/40 text-[10px]">CONSTRUCTION · ÉCHEC</Badge>
                    ) : <Badge variant="outline" className="text-[10px] text-muted-foreground">PAR CONSTRUCTION</Badge>}
                  </div>
                  <p className="text-sm font-semibold">{inv.name}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{inv.desc}</p>
                  {proof && <p className="text-[11px] leading-snug pt-1 border-t border-border/60 text-muted-foreground">{proof.proof}</p>}
                  {inv.checkResult && <p className="text-[11px] leading-snug pt-1 border-t border-border/60 text-muted-foreground">{inv.checkResult.detail}</p>}
                </CardContent>
              </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ── PAR CONSTRUCTION (preuves exécutables) ── */}
        <TabsContent value="construction" className="mt-4 space-y-4">
          <Card className={data.construction?.allPass ? 'border-emerald-500/40' : 'border-amber-500/40'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Braces className="h-4 w-4 text-primary" /> Invariants garantis par construction
                {data.construction?.allPass
                  ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px]">6/6 PASS</Badge>
                  : <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/40 text-[10px]">À RE-EXÉCUTER</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ces 6 invariants ne reposent pas sur une vérification périodique mais sur la STRUCTURE du système :
                chaque sonde ci-dessous exécute une attaque réelle (falsification, lecture cross-tenant, rail étranger…)
                ou scanne les frontières du code, et prouve qu’elle échoue. Ré-exécutable à tout moment — chaque exécution est audité.
              </p>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-[11px]" onClick={runProofs} disabled={runningProofs}>
                {runningProofs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                {runningProofs ? 'Exécution des sondes…' : 'Exécuter les preuves de construction'}
              </Button>
              <div className="grid md:grid-cols-2 gap-3">
                {(data.construction?.proofs ?? []).map((p) => (
                  <Card key={p.id} className={p.status === 'PASS' ? 'border-emerald-500/30' : 'border-red-500/60'}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-primary">{p.id} — {p.name}</span>
                        {p.status === 'PASS'
                          ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px]">PASS</Badge>
                          : <Badge className="bg-red-500/15 text-red-400 border-red-500/40 text-[10px]">FAIL</Badge>}
                      </div>
                      <p className="text-[11px] leading-snug text-muted-foreground">{p.proof}</p>
                      <div className="space-y-1.5 pt-1 border-t border-border/60">
                        {p.checks.map((c) => (
                          <div key={c.label} className="flex items-start gap-1.5">
                            {c.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium leading-tight">{c.label}</p>
                              <p className="text-[10px] text-muted-foreground leading-snug">{c.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Braces className="h-4 w-4 text-primary" /> Contrats publics versionnés (INV-013)</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Contrat</TableHead><TableHead>Nom</TableHead><TableHead className="w-24">Version</TableHead><TableHead className="w-20">Semver</TableHead><TableHead>Périmètre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.construction?.contracts ?? []).map((c) => (
                      <TableRow key={c.contractId}>
                        <TableCell className="font-mono text-xs">{c.contractId}</TableCell>
                        <TableCell className="text-sm">{c.name}</TableCell>
                        <TableCell className="font-mono text-xs">v{c.version}</TableCell>
                        <TableCell>{c.semver ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.scope}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Chaque réponse API porte <span className="font-mono">X-API-Version</span> et <span className="font-mono">X-Contract-Id</span> — un consommateur peut détecter un mismatch de contrat.
              </p>
            </CardContent>
          </Card>
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

        {/* ── SÉCURITÉ : RLS + SIGNATURES + INV-011 ── */}
        <TabsContent value="security" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <Card className="border-emerald-500/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Lock className="h-4 w-4 text-emerald-400" /> RLS applicatif — INV-001</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p className="text-foreground font-medium">{data.rls.mode}</p>
                <p>{data.rls.tenantCount} tenants · {data.rls.orgCount} organisations cloisonnés en base. Périmètre de la session : rôle <span className="font-mono text-primary">{data.rls.scope.role}</span>.</p>
                <ul className="list-disc pl-4 space-y-1">
                  {data.rls.enforcement.map((r) => <li key={r}>{r}</li>)}
                </ul>
                <p className="pt-1 border-t border-border/60">Chemin production : politiques <span className="font-mono">CREATE POLICY</span> PostgreSQL fournies (<span className="font-mono">prisma/rls-postgres.sql</span>) — la garantie passe alors au niveau base.</p>
              </CardContent>
            </Card>

            <Card className={data.evidenceChain.chainIntact ? 'border-emerald-500/40' : 'border-red-500/60'}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Chaîne de signatures Evidence — HMAC-SHA256</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <div className="flex items-center gap-2">
                  {data.evidenceChain.chainIntact
                    ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px]">CHAÎNE INTACTE</Badge>
                    : <Badge className="bg-red-500/15 text-red-400 border-red-500/40 text-[10px]">ROMPUE — séquence {data.evidenceChain.brokenAtSeq}</Badge>}
                  <span>{data.evidenceChain.valid}/{data.evidenceChain.total} signatures valides</span>
                </div>
                <p>Algorithme : <span className="font-mono text-foreground">{data.evidenceChain.algo}</span>. Chaque preuve signe le hash de la précédente : toute altération casse toute la chaîne aval.</p>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-[11px]" onClick={verifyChain}>
                  <ShieldCheck className="h-3 w-3" /> Vérifier toute la chaîne maintenant
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><Globe2 className="h-4 w-4 text-primary" /> Isolation Country Pack — INV-011 (live)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Une organisation ne peut exécuter un paiement que via les rails de SON pack national. Test : tenter un rail d&apos;un pays voisin depuis {data.rls.scope.orgId.slice(0, 8)}… — résultat tracé et audité.
              </p>
              {data.permissions.canTestIsolation ? (
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-[11px]" onClick={testIsolation} disabled={testing}>
                  <PlayCircle className="h-3 w-3" /> {testing ? 'Exécution…' : 'Lancer le test d\'isolation'}
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground">Test réservé aux rôles OWNER / ADMIN (permission governance.admin).</p>
              )}
              {isoResult && (
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {isoResult.results.map((r) => (
                    <div key={r.rail} className="flex items-center gap-2 px-3 py-2 text-xs">
                      {r.allowed
                        ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px]">ALLOW</Badge>
                        : <Badge className="bg-red-500/15 text-red-400 border-red-500/40 text-[10px]">DENY</Badge>}
                      <span className="font-mono">{r.rail}</span>
                      <span className="text-muted-foreground">({r.railLabel})</span>
                      <span className="ml-auto text-muted-foreground text-right text-[11px]">{r.detail}</span>
                    </div>
                  ))}
                </div>
              )}
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
                  <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1"><Fingerprint className="h-3 w-3" />hash {e.hash.slice(0, 16)}… · {fmtDateTime(e.createdAt)}</p>
                  <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3 text-emerald-400" />sig {e.signature?.slice(0, 20)}… · seq {e.seq}</p>
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
