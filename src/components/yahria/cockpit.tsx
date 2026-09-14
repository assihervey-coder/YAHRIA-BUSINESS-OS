'use client'

// YAHRIA BUSINESS OS V1 — Cockpit (Executive Intelligence layer)
// Lecture via apiJson() : un échec API (401/403/500) ne peut JAMAIS être rendu
// comme des données — il déclenche soit la redirection /login (401, globale),
// soit l'état d'erreur gracieux <LoadError/> (jamais de TypeError sur kpis).
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts'
import { Wallet, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, BadgeCheck, Bot, Landmark, Smartphone, Coins, Banknote } from 'lucide-react'
import { StatCard, SectionTitle, LoadError, fcfa, fmt, StatusBadge, fmtDateTime, fmtDate } from './ui'
import { apiJson, ApiFail } from '@/lib/yahria/client-api'

interface DashData {
  org: { name: string; city: string; country: string; taxId: string; rccm: string; sector: string; currency: string } | null
  kpis: {
    treasury: number; receivables: number; overdueAmount: number; payables: number; caMonth: number
    vatCollected: number; vatDeductible: number; vatNet: number; overdueCount: number
    pendingApprovals: number; activeAgents: number; readonlyAgents: number
  }
  accounts: { id: string; name: string; type: string; provider: string; balance: number; isDefault: boolean }[]
  cashSeries: { day: string; solde: number; encaissements: number; decaissements: number }[]
  overdueInvoices: { id: string; number: string; customer: string; total: number; dueDate: string; daysLate: number }[]
  pendingApprovals: { id: string; kind: string; title: string; amount: number | null; riskLevel: string; requestedBy: string }[]
  recentRuns: { id: string; agent: string; agentCode: string; intent: string; state: string; riskLevel: string; createdAt: string }[]
  recentAudit: { id: string; ts: string; actor: string; actorType: string; action: string; summary: string }[]
}

const accountIcon = (type: string) =>
  type === 'BANK' ? <Landmark className="h-4 w-4" /> : type === 'MOBILE_MONEY' ? <Smartphone className="h-4 w-4" /> : type === 'CASH' ? <Coins className="h-4 w-4" /> : <Wallet className="h-4 w-4" />

export function Cockpit() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiFail | null>(null)

  const load = useCallback(() => {
    apiJson<DashData>('/api/v1/dashboard')
      .then((d) => { setData(d); setError(null) })
      .catch((e: unknown) => { if (e instanceof ApiFail && e.status !== 401) setError(e) })
      .finally(() => setLoading(false))
  }, [])
  // Relance manuelle (bouton « Réessayer ») : synchronisé ici, pas dans l'effet.
  const retry = useCallback(() => { setLoading(true); load() }, [load])
  useEffect(load, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }
  // Verrou 2FA ou erreur serveur → état gracieux, jamais de crash.
  if (error) return <LoadError error={error} onRetry={retry} />
  // Garde défensive : contrat drift (réponse 2xx malformée) → même traitement.
  if (!data || !data.kpis || !Array.isArray(data.accounts)) {
    return <LoadError error={{ status: 0, message: 'Réponse inattendue du serveur (contrat dashboard).' }} onRetry={retry} />
  }
  const k = data.kpis

  return (
    <div className="space-y-6">
      <SectionTitle
        title={`Cockpit — ${data.org?.name ?? 'Organisation'}`}
        desc={`${data.org?.city ?? ''} (${data.org?.country ?? ''}) · NCC ${data.org?.taxId ?? ''} · RCCM ${data.org?.rccm ?? ''} — vue direction consolidée XOF`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Trésorerie totale" value={fcfa(k.treasury)} sub={`${data.accounts.length} comptes actifs`} tone="good" icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Créances clients" value={fcfa(k.receivables)} sub={`dont ${fcfa(k.overdueAmount)} en retard`} tone={k.overdueAmount > 0 ? 'warn' : 'good'} icon={<ArrowDownToLine className="h-4 w-4" />} />
        <StatCard label="Dettes à régler" value={fcfa(k.payables)} sub="dépenses non soldées" tone="bad" icon={<ArrowUpFromLine className="h-4 w-4" />} />
        <StatCard label="TVA nette estimée" value={fcfa(k.vatNet)} sub={`collectée ${fcfa(k.vatCollected)} · récup. ${fcfa(k.vatDeductible)}`} tone="accent" icon={<BadgeCheck className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Factures en retard" value={String(k.overdueCount)} sub="recouvrement à lancer" tone={k.overdueCount ? 'bad' : 'good'} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Approbations humaines" value={String(k.pendingApprovals)} sub="dans la file INV-009" tone={k.pendingApprovals ? 'warn' : 'good'} />
        <StatCard label="Agents actifs" value={String(k.activeAgents)} sub={`${k.readonlyAgents} en lecture seule`} tone="accent" icon={<Bot className="h-4 w-4" />} />
        <StatCard label="CA facturé (mois)" value={fcfa(k.caMonth)} sub="factures émises ce mois" />
      </div>

      <Tabs defaultValue="cash" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cash">Trésorerie 14 j</TabsTrigger>
          <TabsTrigger value="flows">Flux par jour</TabsTrigger>
        </TabsList>
        <TabsContent value="cash">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Position de trésorerie consolidée (XOF)</CardTitle></CardHeader>
            <CardContent className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.cashSeries} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={62} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                  <Tooltip
                    formatter={(v: number | string) => fcfa(Number(v))}
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="solde" stroke="#38bdf8" strokeWidth={2} fill="url(#cashGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="flows">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Encaissements vs décaissements (XOF)</CardTitle></CardHeader>
            <CardContent className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.cashSeries} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={62} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                  <Tooltip formatter={(v: number | string) => fcfa(Number(v))} contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="encaissements" name="Encaissements" fill="#34d399" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="decaissements" name="Décaissements" fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Comptes (MONEY)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground">{accountIcon(a.type)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground">{a.provider}{a.isDefault ? ' · défaut' : ''}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{fcfa(a.balance)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">File d'approbation humaine (INV-009)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.pendingApprovals.length === 0 && <p className="text-sm text-muted-foreground">Aucune action en attente — la voie est libre.</p>}
            {data.pendingApprovals.map((a) => (
              <div key={a.id} className="rounded-md border px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={a.riskLevel} />
                  <span className="text-[10px] text-muted-foreground">{a.kind === 'AGENT_ACTION' ? 'ACTION AGENT' : 'PAIEMENT'}</span>
                </div>
                <p className="text-xs leading-snug">{a.title}</p>
                <p className="text-[10px] text-muted-foreground">demandé par {a.requestedBy}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Factures en retard</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.overdueInvoices.length === 0 && <p className="text-sm text-muted-foreground">Aucun retard. Excellent DSO.</p>}
            {data.overdueInvoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{i.number} — {i.customer}</p>
                  <p className="text-[11px] text-muted-foreground">échue {fmtDate(i.dueDate)} · {i.daysLate} j de retard</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-red-300 whitespace-nowrap">{fcfa(i.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Dernières exécutions d'agents</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {data.recentRuns.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{r.agentCode} <span className="font-normal text-muted-foreground">— {r.intent.slice(0, 70)}</span></p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDateTime(r.createdAt)}</p>
                </div>
                <StatusBadge status={r.state} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Flux d'audit immuable (AUDIT)</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 max-h-72 overflow-y-auto">
            {data.recentAudit.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs rounded-md px-2 py-1.5 hover:bg-accent/40">
                <StatusBadge status={a.actorType} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="leading-snug">{a.summary}</p>
                  <p className="text-[10px] text-muted-foreground">{a.actor} · {fmtDateTime(a.ts)} · {a.action}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
