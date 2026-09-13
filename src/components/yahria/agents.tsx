'use client'

// YAHRIA BUSINESS OS V1 — 05_AGENTS view (registry, control loop, approvals inbox)
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge, SectionTitle, fcfa, fmtDateTime } from './ui'
import { useToast } from '@/hooks/use-toast'
import { Bot, PlayCircle, CheckCircle2, XCircle, ShieldAlert, Wrench, FileCheck2, Lock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Agent {
  id: string; code: string; name: string; domain: string; status: string; autonomyLevel: string
  description: string; capabilities: string[]; tools: string[]; maxAmount: number
  approvalAbove: number; readOnly: boolean; version: string
}
interface LoopStep { step: string; state: 'OK' | 'WARN' | 'BLOCK' | 'WAIT' | 'INFO'; detail: string }
interface Run {
  id: string; agentCode: string; agentName: string; intent: string; state: string
  steps: LoopStep[]; riskScore: number; riskLevel: string; result: Record<string, unknown> | null
  evidenceId: string | null; createdAt: string; completedAt: string | null
}
interface Approval {
  id: string; kind: string; status: string; title: string; description: string
  amount: number | null; currency: string | null; requestedBy: string; riskLevel: string
  createdAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null
}

const AUTONOMY_LABEL: Record<string, string> = {
  SUGGEST: 'Suggère', RECOMMEND: 'Recommande', DECIDE: 'Décide', ACT: 'Agit (sous seuil)',
}

export function AgentsView() {
  const { toast } = useToast()
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [selectedAgent, setSelectedAgent] = useState('TreasuryAgent')
  const [intent, setIntent] = useState('')
  const [busy, setBusy] = useState(false)
  const [openRun, setOpenRun] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/v1/agents').then((r) => r.json()).then((d) => {
      setAgents(d.agents ?? []); setRuns(d.runs ?? [])
    })
    fetch('/api/v1/agents/approvals').then((r) => r.json()).then((d) => setApprovals(d.items ?? []))
  }, [])
  useEffect(load, [load])

  async function runLoop() {
    if (!intent.trim()) return
    setBusy(true)
    const res = await fetch('/api/v1/agents/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentCode: selectedAgent, intent }),
    })
    const d = await res.json()
    setBusy(false)
    if (res.ok) {
      toast({
        title: `Run ${d.run.state}`,
        description: `${d.run.state === 'AWAITING_APPROVAL' ? 'Validation humaine requise (INV-009)' : d.run.state === 'BLOCKED_POLICY' ? 'Bloqué par le Policy Engine (INV-010)' : 'Exécution contrôlée terminée'}`,
      })
      setIntent('')
      load()
      setOpenRun(d.run.id)
    } else toast({ title: 'Erreur', description: d.error, variant: 'destructive' })
  }

  async function decide(approvalId: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
    const res = await fetch('/api/v1/agents/approvals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId, decision, decidedBy: 'Awa Koné (DG)', note }),
    })
    const d = await res.json()
    if (res.ok) {
      toast({ title: decision === 'APPROVED' ? 'Approuvé — exécution lancée' : 'Refusé — action annulée', description: 'Décision auditable INV-HUMAN-002, preuve enregistrée.' })
      load()
    } else toast({ title: 'Erreur', description: d.error, variant: 'destructive' })
  }

  if (!agents) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>

  const pending = approvals.filter((a) => a.status === 'PENDING')

  return (
    <div className="space-y-5">
      <SectionTitle
        title="AGENTS — acteurs logiciels contrôlés"
        desc="Jamais de pouvoirs illimités : Intent → Plan → Outils → Policy → Autorisation → Risque → Approbation → Exécution → Vérification → Evidence → Audit (spec §18)."
      />

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">
            Approbations {pending.length > 0 && <Badge className="ml-1.5 bg-amber-500/20 text-amber-300 border-amber-500/40">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="registry">Registre ({agents.length})</TabsTrigger>
          <TabsTrigger value="loop">Boucle de contrôle</TabsTrigger>
          <TabsTrigger value="runs">Exécutions ({runs.length})</TabsTrigger>
        </TabsList>

        {/* ── APPROVALS INBOX ── */}
        <TabsContent value="inbox" className="mt-4 space-y-3">
          {approvals.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucune approbation enregistrée.</CardContent></Card>}
          {approvals.map((a) => (
            <Card key={a.id} className={a.status === 'PENDING' ? 'border-amber-500/40' : 'opacity-70'}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={a.status} />
                  <StatusBadge status={a.riskLevel} />
                  <Badge variant="outline" className="text-[10px]">{a.kind === 'AGENT_ACTION' ? 'ACTION D\'AGENT' : 'PAIEMENT'}</Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto">{fmtDateTime(a.createdAt)} · demandé par {a.requestedBy}</span>
                </div>
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{a.description}</p>
                {a.amount != null && <p className="text-sm font-bold tabular-nums">{fcfa(a.amount)} {a.currency ?? ''}</p>}
                {a.status === 'PENDING' ? (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="bg-emerald-600/90 hover:bg-emerald-600" onClick={() => decide(a.id, 'APPROVED', 'Validé depuis la console')}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approuver & exécuter
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500/40 text-red-300 hover:bg-red-500/10" onClick={() => decide(a.id, 'REJECTED', 'Refusé depuis la console')}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Refuser
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Décision : {a.decidedBy} — {fmtDateTime(a.decidedAt)}{a.decisionNote ? ` · « ${a.decisionNote} »` : ''}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── REGISTRY ── */}
        <TabsContent value="registry" className="mt-4">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agents.map((a) => (
              <Card key={a.id} className="flex flex-col">
                <CardContent className="pt-4 space-y-2 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-fuchsia-300" /></div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{a.code} · v{a.version} · {a.domain}</p>
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{a.description}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{AUTONOMY_LABEL[a.autonomyLevel]}</Badge>
                    {a.readOnly && <Badge variant="outline" className="text-[10px]"><Lock className="h-2.5 w-2.5 mr-1" />lecture seule</Badge>}
                    {a.approvalAbove > 0 && <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40">{'>'}&nbsp;{fcfa(a.approvalAbove)} → humain</Badge>}
                    {a.maxAmount > 0 && <Badge variant="outline" className="text-[10px] text-red-300 border-red-500/40">plafond {fcfa(a.maxAmount)}</Badge>}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-start gap-1.5 pt-1 border-t border-border/60">
                    <Wrench className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="font-mono leading-snug">{a.tools.join(' · ') || '—'}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── CONTROL LOOP RUNNER ── */}
        <TabsContent value="loop" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><PlayCircle className="h-4 w-4" /> Déclencher une exécution contrôlée</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium">Agent</span>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => <SelectItem key={a.code} value={a.code}>{a.name} — {AUTONOMY_LABEL[a.autonomyLevel]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium">Intention (le montant déclenche la policy)</span>
                  <Input value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="Ex : EXECUTE_PAYMENT fournisseur 900000 FCFA" />
                </div>
              </div>
              <Textarea
                value={intent} onChange={(e) => setIntent(e.target.value)}
                placeholder="Exemples :&#10;FORECAST_CASH 30 jours&#10;SCORE_RISK portefeuille clients&#10;GENERATE_REPORT hebdomadaire&#10;EXECUTE_PAYMENT fournisseur 120000 FCFA&#10;EXECUTE_PAYMENT fournisseur 950000 FCFA (→ approbation humaine)&#10;EXECUTE_PAYMENT 500000 FCFA (avec PayrollAgent → blocage INV-010)"
                rows={3}
              />
              <Button onClick={runLoop} disabled={busy || !intent.trim()}>
                {busy ? 'Boucle en cours…' : 'Lancer la boucle de contrôle'}
              </Button>
              <div className="rounded-md border bg-accent/20 p-3 text-xs text-muted-foreground leading-relaxed">
                <ShieldAlert className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5 text-amber-300" />
                Garde-fous actifs : moindre privilège (INV-010) · approbation humaine au-delà des seuils (INV-009) · idempotence (INV-006) ·
                aucune écriture directe en base — les agents passent par les outils autorisés du registre.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── RUNS ── */}
        <TabsContent value="runs" className="mt-4 space-y-2">
          {runs.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucune exécution — lancez la boucle de contrôle.</CardContent></Card>}
          {runs.map((r) => (
            <Card key={r.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setOpenRun(openRun === r.id ? null : r.id)}>
              <CardContent className="py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.state} />
                  <span className="text-sm font-semibold">{r.agentCode}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1 min-w-[120px]">{r.intent}</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDateTime(r.createdAt)}</span>
                </div>
                {openRun === r.id && (
                  <div className="space-y-1.5 pt-2 border-t border-border/60">
                    {r.steps.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="w-32 shrink-0"><StatusBadge status={s.state} /></span>
                        <span className="text-muted-foreground leading-snug"><span className="font-medium text-foreground/80">{s.step}</span> — {s.detail}</span>
                      </div>
                    ))}
                    {r.result && (
                      <div className="rounded-md border bg-accent/20 p-2.5 mt-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Résultat</p>
                        <pre className="text-[11px] leading-snug overflow-x-auto whitespace-pre-wrap">{JSON.stringify(r.result, null, 1)}</pre>
                      </div>
                    )}
                    {r.evidenceId && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 pt-1"><FileCheck2 className="h-3 w-3" />Evidence {r.evidenceId} · risque {r.riskScore}/100 ({r.riskLevel})</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
