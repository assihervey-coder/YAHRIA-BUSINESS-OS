'use client'

// YAHRIA BUSINESS OS V1 — shared UI primitives
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n))
}

export function fcfa(n: number | null | undefined): string {
  if (n == null) return '—'
  return fmt(n) + ' F'
}

export function xof(n: number | null | undefined): string {
  if (n == null) return '—'
  return fmt(n) + ' FCFA'
}

export function num(n: number): string {
  return String(Math.round(n))
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const map: Record<string, string> = {
    EXECUTED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    RECONCILED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    PAID: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    APPROVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    PASS: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    ALLOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    SENT: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    PARTIAL: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    AVAILABLE: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    PENDING_APPROVAL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    AWAITING_APPROVAL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    PENDING_POLICY: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    WAIT: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    WARN: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    REQUIRE_APPROVAL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    REJECTED: 'bg-red-500/15 text-red-300 border-red-500/30',
    FAILED: 'bg-red-500/15 text-red-300 border-red-500/30',
    BLOCKED_POLICY: 'bg-red-500/15 text-red-300 border-red-500/30',
    OVERDUE: 'bg-red-500/15 text-red-300 border-red-500/30',
    HIGH: 'bg-red-500/15 text-red-300 border-red-500/30',
    CRITICAL: 'bg-red-500/15 text-red-300 border-red-500/30',
    DENY: 'bg-red-500/15 text-red-300 border-red-500/30',
    BLOCK: 'bg-red-500/15 text-red-300 border-red-500/30',
    QUARANTINE: 'bg-red-500/15 text-red-300 border-red-500/30',
    FAIL: 'bg-red-500/15 text-red-300 border-red-500/30',
    MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    READONLY: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    DRAFT: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    SUSPENDED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    CANCELLED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    PLANNED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    INFO: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    OK: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  }
  const labels: Record<string, string> = {
    PENDING_APPROVAL: 'EN APPROBATION',
    AWAITING_APPROVAL: 'EN ATTENTE HUMAIN',
    PENDING_POLICY: 'POLICY…',
    BLOCKED_POLICY: 'BLOQUÉ POLICY',
    REQUIRE_APPROVAL: 'APPROBATION REQUISE',
    READONLY: 'LECTURE SEULE',
  }
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold tracking-wide px-1.5 py-0', map[status] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30', className)}>
      {labels[status] ?? status.replace(/_/g, ' ')}
    </Badge>
  )
}

export function StatCard({ label, value, sub, tone = 'default', icon }: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent'
  icon?: React.ReactNode
}) {
  const tones: Record<string, string> = {
    default: 'text-foreground',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-red-300',
    accent: 'text-[oklch(0.78_0.12_220)]',
  }
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</span>
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      </div>
      <span className={cn('text-xl md:text-2xl font-bold tracking-tight tabular-nums', tones[tone])}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
    </div>
  )
}

export function SectionTitle({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {desc && <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {right}
    </div>
  )
}

/**
 * État d'erreur gracieux — affiché quand une lecture API échoue (hors 401,
 * qui est géré globalement par redirection vers /login). Deux variantes :
 *  · verrou 2FA (code MFA_ENROLLMENT_REQUIRED) → encart ambre explicite
 *  · toute autre erreur → encart neutre avec bouton « Réessayer »
 * Garantit qu'aucune vue ne crashe sur un corps d'erreur API.
 */
export function LoadError({ error, onRetry }: { error: { status: number; message: string; code?: string } | null; onRetry?: () => void }) {
  if (!error) return null
  if (error.code === 'MFA_ENROLLMENT_REQUIRED') {
    return (
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
        <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-300">Données verrouillées — 2FA requise</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ouvrez l&apos;onglet « Sécurité » pour configurer la double authentification, puis revenez ici.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-300">Impossible de charger les données</p>
        <p className="text-xs text-muted-foreground mt-0.5 break-words">{error.message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/40 text-red-300 hover:bg-red-500/15 shrink-0" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  )
}

export const NODE_COLORS: Record<string, string> = {
  ORGANIZATION: '#f59e0b',
  CUSTOMER: '#38bdf8',
  SUPPLIER: '#a78bfa',
  EMPLOYEE: '#94a3b8',
  PRODUCT: '#34d399',
  ACCOUNT: '#22d3ee',
  INVOICE: '#fbbf24',
  PAYMENT: '#4ade80',
  EXPENSE: '#f87171',
  AGENT: '#e879f9',
}
