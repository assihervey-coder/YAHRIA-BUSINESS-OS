'use client'

// YAHRIA BUSINESS OS V1 — OS Shell
// YAHRIA PLATFORM (Identity/Tenant/Policy/Audit/Evidence) ───── YAHRIA BUSINESS OS (10 domaines)
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard, Building2, Wallet, BookOpenCheck, Network, BrainCircuit,
  Bot, Globe2, Scale, ShieldAlert, ChevronLeft, ChevronRight
} from 'lucide-react'

const NAV = [
  { id: 'cockpit', label: 'Cockpit', sub: 'Executive Intelligence', icon: LayoutDashboard },
  { id: 'core', label: 'Core', sub: '00 — noyau métier', icon: Building2 },
  { id: 'money', label: 'Money', sub: '01 — paiements & trésorerie', icon: Wallet },
  { id: 'finance', label: 'Finance', sub: '02 — OHADA SYSCOHADA', icon: BookOpenCheck },
  { id: 'graph', label: 'Business Graph', sub: '03 — contexte de l\'IA', icon: Network },
  { id: 'copilot', label: 'Copilot IA', sub: '04 — intelligence exécutive', icon: BrainCircuit },
  { id: 'agents', label: 'Agents', sub: '05 — sous gouvernance', icon: Bot },
  { id: 'pays', label: 'Pays & Secteurs', sub: '06/07 — packs & engines', icon: Globe2 },
  { id: 'governance', label: 'Gouvernance', sub: '99 — policy · audit · evidence', icon: Scale },
] as const

type ViewId = (typeof NAV)[number]['id']

interface Meta {
  org: { name: string; legalName: string; city: string; countryCode: string; currencyCode: string; sectorCode: string; taxId: string } | null
  tenant: { name: string; plan: string } | null
}

export default function Home() {
  const [view, setView] = useState<ViewId>('cockpit')
  const [collapsed, setCollapsed] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [approvals, setApprovals] = useState(0)

  useEffect(() => {
    fetch('/api/v1/meta').then((r) => r.json()).then(setMeta).catch(() => {})
  }, [])
  useEffect(() => {
    const t = setInterval(() => {
      fetch('/api/v1/agents/approvals').then((r) => r.json()).then((d) => setApprovals((d.items ?? []).filter((a: { status: string }) => a.status === 'PENDING').length)).catch(() => {})
    }, 15000)
    fetch('/api/v1/agents/approvals').then((r) => r.json()).then((d) => setApprovals((d.items ?? []).filter((a: { status: string }) => a.status === 'PENDING').length)).catch(() => {})
    return () => clearInterval(t)
  }, [])

  const active = NAV.find((n) => n.id === view)!

  return (
    <div className="dark min-h-screen flex bg-background text-foreground" style={{ colorScheme: 'dark' }}>
      {/* ── SIDEBAR ── */}
      <aside className={cn('hidden md:flex flex-col border-r bg-sidebar transition-all duration-200 shrink-0', collapsed ? 'w-[68px]' : 'w-60')}>
        <div className="flex items-center gap-2.5 px-4 h-16 border-b shrink-0">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[oklch(0.8_0.12_220)] to-[oklch(0.6_0.14_240)] flex items-center justify-center font-black text-[13px] text-[oklch(0.16_0.04_255)] shrink-0">Y</div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight tracking-tight">YAHRIA</p>
              <p className="text-[10px] text-muted-foreground leading-tight">BUSINESS OS · V1</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map((n) => {
            const Icon = n.icon
            const isActive = view === n.id
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                title={collapsed ? n.label : undefined}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  isActive ? 'bg-primary/15 text-primary border border-primary/25' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
                {!collapsed && (
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-tight truncate">{n.label}</span>
                    <span className="block text-[10px] text-muted-foreground leading-tight truncate">{n.sub}</span>
                  </span>
                )}
                {!collapsed && n.id === 'agents' && approvals > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full px-1.5 py-0.5">{approvals}</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="border-t p-2 shrink-0">
          <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /> Réduire</>}
          </button>
          {!collapsed && (
            <p className="text-[10px] text-muted-foreground text-center pt-2 pb-1 leading-relaxed">
              DATA → GRAPH → INTELLIGENCE → DÉCISION<br />→ POLICY → AGENTS → EXÉCUTION → EVIDENCE
            </p>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-background/80 backdrop-blur flex items-center gap-3 px-4 md:px-6 sticky top-0 z-20 shrink-0">
          <div className="md:hidden h-8 w-8 rounded-lg bg-gradient-to-br from-[oklch(0.8_0.12_220)] to-[oklch(0.6_0.14_240)] flex items-center justify-center font-black text-xs text-[oklch(0.16_0.04_255)]">Y</div>
          <div className="min-w-0 hidden sm:block">
            <h1 className="text-sm font-semibold leading-tight truncate">{active.label}</h1>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">{active.sub}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {approvals > 0 && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] gap-1">
                <ShieldAlert className="h-3 w-3" /> {approvals} approbation{approvals > 1 ? 's' : ''}
              </Badge>
            )}
            {meta?.org && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                🇨🇮 {meta.org.legalName} · {meta.org.currencyCode}
              </Badge>
            )}
            {meta?.tenant && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground hidden lg:inline-flex">
                tenant : {meta.tenant.name} · {meta.tenant.plan}
              </Badge>
            )}
            <div className="h-8 w-8 rounded-full bg-accent border border-border flex items-center justify-center text-xs font-bold">AK</div>
          </div>
        </header>

        {/* mobile nav */}
        <div className="md:hidden border-b px-3 py-2 flex gap-1.5 overflow-x-auto">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={cn('text-xs px-3 py-1.5 rounded-full border whitespace-nowrap', view === n.id ? 'bg-primary/15 border-primary/30 text-primary' : 'border-border text-muted-foreground')}>
              {n.label}
            </button>
          ))}
        </div>

        <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto">
          {view === 'cockpit' && <CockpitLazy />}
          {view === 'core' && <CoreLazy />}
          {view === 'money' && <MoneyLazy />}
          {view === 'finance' && <FinanceLazy />}
          {view === 'graph' && <GraphLazy />}
          {view === 'copilot' && <CopilotLazy />}
          {view === 'agents' && <AgentsLazy />}
          {view === 'pays' && <PaysLazy />}
          {view === 'governance' && <GovernanceLazy />}
        </main>

        <footer className="mt-auto border-t py-3 px-6 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>YAHRIA BUSINESS OS V1 — The Intelligent Operating System for African Business</span>
          <span className="font-mono">YBOS-ARCH-V1 · baseline 1.0.0 · policy-controlled · AI-governed · financially-consistent</span>
        </footer>
      </div>
    </div>
  )
}

// Lazy imports keep first paint fast
import { Cockpit } from '@/components/yahria/cockpit'
import { CoreView } from '@/components/yahria/core'
import { MoneyView } from '@/components/yahria/money'
import { FinanceView } from '@/components/yahria/finance'
import { GraphView } from '@/components/yahria/graph'
import { CopilotView } from '@/components/yahria/copilot'
import { AgentsView } from '@/components/yahria/agents'
import { PaysSecteursView } from '@/components/yahria/pays'
import { GovernanceView } from '@/components/yahria/governance'

function CockpitLazy() { return <Cockpit /> }
function CoreLazy() { return <CoreView /> }
function MoneyLazy() { return <MoneyView /> }
function FinanceLazy() { return <FinanceView /> }
function GraphLazy() { return <GraphView /> }
function CopilotLazy() { return <CopilotView /> }
function AgentsLazy() { return <AgentsView /> }
function PaysLazy() { return <PaysSecteursView /> }
function GovernanceLazy() { return <GovernanceView /> }
