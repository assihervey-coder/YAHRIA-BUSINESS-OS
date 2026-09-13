'use client'

// YAHRIA BUSINESS OS V1 — OS Shell
// YAHRIA PLATFORM (Identity/Tenant/Policy/Audit/Evidence) ───── YAHRIA BUSINESS OS (10 domaines)
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard, Building2, Wallet, BookOpenCheck, Network, BrainCircuit,
  Bot, Globe2, Scale, ShieldAlert, ChevronLeft, ChevronRight, Users, LogOut
} from 'lucide-react'

const NAV = [
  { id: 'cockpit', label: 'Cockpit', sub: 'Executive Intelligence', icon: LayoutDashboard, perm: null },
  { id: 'core', label: 'Core', sub: '00 — noyau métier', icon: Building2, perm: 'core.read' },
  { id: 'money', label: 'Money', sub: '01 — paiements & trésorerie', icon: Wallet, perm: 'money.read' },
  { id: 'finance', label: 'Finance', sub: '02 — OHADA SYSCOHADA', icon: BookOpenCheck, perm: 'finance.read' },
  { id: 'graph', label: 'Business Graph', sub: '03 — contexte de l\'IA', icon: Network, perm: null },
  { id: 'copilot', label: 'Copilot IA', sub: '04 — intelligence exécutive', icon: BrainCircuit, perm: 'copilot.use' },
  { id: 'agents', label: 'Agents', sub: '05 — sous gouvernance', icon: Bot, perm: null },
  { id: 'pays', label: 'Pays & Secteurs', sub: '06/07 — packs & engines', icon: Globe2, perm: null },
  { id: 'governance', label: 'Gouvernance', sub: '99 — policy · audit · evidence', icon: Scale, perm: 'governance.read' },
  { id: 'users', label: 'Utilisateurs', sub: 'RBAC — comptes & rôles', icon: Users, perm: 'users.read' },
] as const

type ViewId = (typeof NAV)[number]['id']

interface Me {
  name: string
  email: string
  role: string
  permissions: string[]
}

function navAllowed(perm: string | null, permissions: string[]): boolean {
  if (!perm) return true
  return permissions.some((p) => p === '*' || p === perm || (p.endsWith('.*') && perm.startsWith(p.slice(0, -1))) || (p.startsWith('*.') && perm.endsWith(p.slice(1))))
}

interface Meta {
  org: { name: string; legalName: string; city: string; countryCode: string; currencyCode: string; sectorCode: string; taxId: string } | null
  tenant: { name: string; plan: string } | null
}

export default function Home() {
  const router = useRouter()
  const [view, setView] = useState<ViewId>('cockpit')
  const [collapsed, setCollapsed] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [approvals, setApprovals] = useState(0)
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    fetch('/api/v1/auth/me').then((r) => {
      if (r.status === 401) { router.push('/login'); return null }
      return r.json()
    }).then((d) => d?.user && setMe(d.user)).catch(() => {})
    fetch('/api/v1/meta').then((r) => r.json()).then(setMeta).catch(() => {})
  }, [router])
  useEffect(() => {
    const t = setInterval(() => {
      fetch('/api/v1/agents/approvals').then((r) => r.json()).then((d) => setApprovals((d.items ?? []).filter((a: { status: string }) => a.status === 'PENDING').length)).catch(() => {})
    }, 15000)
    fetch('/api/v1/agents/approvals').then((r) => r.json()).then((d) => setApprovals((d.items ?? []).filter((a: { status: string }) => a.status === 'PENDING').length)).catch(() => {})
    return () => clearInterval(t)
  }, [])

  const active = NAV.find((n) => n.id === view)!
  const perms = me?.permissions ?? []
  const visibleNav = NAV.filter((n) => navAllowed(n.perm as string | null, perms))
  const viewAllowed = (id: ViewId) => { const n = NAV.find((x) => x.id === id); return n ? navAllowed(n.perm as string | null, perms) : false }
  const effectiveView: ViewId = viewAllowed(view) ? view : 'cockpit'

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {})
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="dark h-dvh overflow-hidden flex bg-background text-foreground" style={{ colorScheme: 'dark' }}>
      {/* Shell verrouillé à la hauteur de l'écran : chaque bande gère son propre scroll */}
      {/* ── SIDEBAR (bande de gauche — scroll indépendant) ── */}
      <aside className={cn('hidden md:flex h-full min-h-0 flex-col overflow-hidden border-r bg-sidebar transition-all duration-200 shrink-0', collapsed ? 'w-[68px]' : 'w-60')}>
        <div className="flex items-center gap-2.5 px-4 h-16 border-b shrink-0">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[oklch(0.8_0.12_220)] to-[oklch(0.6_0.14_240)] flex items-center justify-center font-black text-[13px] text-[oklch(0.16_0.04_255)] shrink-0">Y</div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight tracking-tight">YAHRIA</p>
              <p className="text-[10px] text-muted-foreground leading-tight">BUSINESS OS · V1</p>
            </div>
          )}
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain os-scroll py-3 px-2 space-y-0.5">
          {visibleNav.map((n) => {
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

      {/* ── MAIN (grande bande de droite — scroll indépendant) ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-y-auto overscroll-contain os-scroll">
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
            {me && (
              <Badge variant="outline" className="text-[10px] gap-1.5 border-primary/30 text-primary">
                {me.name.split(' ').map((w) => w[0]).slice(0, 2).join('')} · {me.role}
              </Badge>
            )}
            <Button size="sm" variant="ghost" onClick={logout} className="h-8 px-2 text-muted-foreground hover:text-foreground" title="Déconnexion">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* mobile nav */}
        <div className="md:hidden border-b px-3 py-2 flex gap-1.5 overflow-x-auto">
          {visibleNav.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={cn('text-xs px-3 py-1.5 rounded-full border whitespace-nowrap', view === n.id ? 'bg-primary/15 border-primary/30 text-primary' : 'border-border text-muted-foreground')}>
              {n.label}
            </button>
          ))}
        </div>

        <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto">
          {effectiveView === 'cockpit' && <CockpitLazy />}
          {effectiveView === 'core' && <CoreLazy />}
          {effectiveView === 'money' && <MoneyLazy />}
          {effectiveView === 'finance' && <FinanceLazy />}
          {effectiveView === 'graph' && <GraphLazy />}
          {effectiveView === 'copilot' && <CopilotLazy />}
          {effectiveView === 'agents' && <AgentsLazy />}
          {effectiveView === 'pays' && <PaysLazy />}
          {effectiveView === 'governance' && <GovernanceLazy />}
          {effectiveView === 'users' && <UsersLazy />}
        </main>

        <footer className="mt-auto border-t py-3 px-6 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>YAHRIA BUSINESS OS V1 — The Intelligent Operating System for African Business</span>
          <span className="font-mono">YBOS-ARCH-V1 · baseline 1.1.0 · multi-tenant · policy-controlled · AI-governed · financially-consistent</span>
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
import { UsersView } from '@/components/yahria/users'

function CockpitLazy() { return <Cockpit /> }
function CoreLazy() { return <CoreView /> }
function MoneyLazy() { return <MoneyView /> }
function FinanceLazy() { return <FinanceView /> }
function GraphLazy() { return <GraphView /> }
function CopilotLazy() { return <CopilotView /> }
function AgentsLazy() { return <AgentsView /> }
function PaysLazy() { return <PaysSecteursView /> }
function GovernanceLazy() { return <GovernanceView /> }
function UsersLazy() { return <UsersView /> }
