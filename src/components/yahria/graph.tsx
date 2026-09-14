'use client'

// YAHRIA BUSINESS OS V1 — 03_BUSINESS GRAPH view (rebuildable projection, INV-GRAPH-004)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionTitle, NODE_COLORS, LoadError, fcfa } from './ui'
import { apiJson, ApiFail, isAuthLoss, toApiFail } from '@/lib/yahria/client-api'
import { RefreshCcw, Network } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

interface GNode { id: string; type: string; refId: string; label: string; risk: number | null; meta: Record<string, unknown> }
interface GEdge { id: string; source: string; target: string; relation: string; weight: number }
interface GraphData { nodes: GNode[]; edges: GEdge[]; stats: { nodes: number; edges: number; byType: Record<string, number> } }

const TYPE_ORDER = ['ORGANIZATION', 'CUSTOMER', 'INVOICE', 'PAYMENT', 'ACCOUNT', 'SUPPLIER', 'EXPENSE', 'PRODUCT', 'EMPLOYEE', 'AGENT']

export function GraphView() {
  const { toast } = useToast()
  const [data, setData] = useState<GraphData | null>(null)
  const [selected, setSelected] = useState<GNode | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [hiddenTypes, setHiddenTypes] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiFail | null>(null)

  const load = useCallback(() => {
    apiJson<GraphData>('/api/v1/graph')
      .then((d) => { setData(d); setError(null) })
      .catch((e: unknown) => { if (!isAuthLoss(e)) setError(toApiFail(e)) })
  }, [])
  useEffect(load, [load])

  const visible = useMemo(() => {
    if (!data) return { nodes: [] as GNode[], edges: [] as GEdge[], positions: new Map<string, { x: number; y: number }>() }
    const nodes = data.nodes.filter((n) => !hiddenTypes[n.type])
    const ids = new Set(nodes.map((n) => n.id))
    const edges = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target))

    // deterministic layout: type-rings around center org node
    const W = 920, H = 560
    const positions = new Map<string, { x: number; y: number }>()
    const org = nodes.find((n) => n.type === 'ORGANIZATION')
    if (org) positions.set(org.id, { x: W / 2, y: H / 2 })
    const byType: Record<string, GNode[]> = {}
    for (const n of nodes) {
      if (n.type === 'ORGANIZATION') continue
      ;(byType[n.type] ??= []).push(n)
    }
    const rings = TYPE_ORDER.filter((t) => t !== 'ORGANIZATION' && byType[t]?.length)
    const maxRing = rings.length
    rings.forEach((t, ringIdx) => {
      const list = byType[t]
      const radius = 90 + ((ringIdx + 1) / (maxRing + 1)) * 210
      list.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / list.length + ringIdx * 0.7
        const x = W / 2 + radius * Math.cos(angle)
        const y = H / 2 + radius * Math.sin(angle) * 0.86
        positions.set(n.id, { x, y })
      })
    })
    return { nodes, edges, positions }
  }, [data, hiddenTypes])

  async function rebuild() {
    setBusy(true)
    const res = await fetch('/api/v1/graph', { method: 'POST' })
    setBusy(false)
    if (res.ok) { toast({ title: 'Projection reconstruite', description: 'Le graphe a été re-projeté depuis les événements métier (INV-GRAPH-004).' }); load() }
  }

  if (error) return <div className="space-y-3"><LoadError error={error} onRetry={load} /></div>
  if (!data) return <Skeleton className="h-[32rem]" />

  const connectedEdges = selected ? data.edges.filter((e) => e.source === selected.id || e.target === selected.id) : []
  const edgeColor = 'rgba(148,163,184,0.28)'
  const highlighted = new Set(connectedEdges.map((e) => e.id))

  return (
    <div className="space-y-4">
      <SectionTitle
        title="BUSINESS GRAPH — contexte commun de l'IA"
        desc="Projection sémantique de l'entreprise : clients, factures, paiements, comptes, agents. Reconstructible à tout moment depuis les événements (INV-GRAPH-004)."
        right={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{data.stats.nodes} nœuds · {data.stats.edges} relations</Badge>
            <Button size="sm" variant="outline" onClick={rebuild} disabled={busy}>
              <RefreshCcw className={`h-4 w-4 mr-1 ${busy ? 'animate-spin' : ''}`} /> Reconstruire
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(data.stats.byType).map(([t, c]) => (
          <button key={t} onClick={() => setHiddenTypes((h) => ({ ...h, [t]: !h[t] }))}
            className={`text-[11px] px-2 py-1 rounded-full border flex items-center gap-1.5 transition-opacity ${hiddenTypes[t] ? 'opacity-40' : ''}`}
            style={{ borderColor: NODE_COLORS[t] ?? '#64748b' }}>
            <span className="h-2 w-2 rounded-full" style={{ background: NODE_COLORS[t] ?? '#64748b' }} />
            {t} ({c})
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <svg viewBox="0 0 920 560" className="w-full h-auto select-none" role="img" aria-label="Business Graph">
              {visible.edges.map((e) => {
                const s = visible.positions.get(e.source)
                const t = visible.positions.get(e.target)
                if (!s || !t) return null
                const dim = selected && !highlighted.has(e.id)
                return (
                  <g key={e.id} opacity={dim ? 0.08 : hoveredEdgeOpacity(e.id, hover, highlighted)} className="transition-opacity">
                    <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={highlighted.has(e.id) && selected ? '#38bdf8' : edgeColor} strokeWidth={highlighted.has(e.id) && selected ? 1.8 : 1} />
                    {(highlighted.has(e.id) && selected) && (
                      <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 3} fontSize="9" fill="#94a3b8" textAnchor="middle">{e.relation}</text>
                    )}
                  </g>
                )
              })}
              {visible.nodes.map((n) => {
                const p = visible.positions.get(n.id)
                if (!p) return null
                const isOrg = n.type === 'ORGANIZATION'
                const r = isOrg ? 26 : n.type === 'AGENT' ? 14 : 11 + Math.min(8, (data.edges.filter((e) => e.source === n.id || e.target === n.id).length) / 2)
                const dim = selected && selected.id !== n.id && !connectedEdges.some((e) => e.source === n.id || e.target === n.id)
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer transition-opacity" opacity={dim ? 0.15 : 1}
                    onClick={() => setSelected(n)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                    <circle r={r + 3} fill={NODE_COLORS[n.type] ?? '#64748b'} opacity={hover === n.id || selected?.id === n.id ? 0.35 : 0} />
                    <circle r={r} fill="rgba(15,23,42,0.9)" stroke={NODE_COLORS[n.type] ?? '#64748b'} strokeWidth={selected?.id === n.id ? 3 : 1.6} />
                    {n.risk != null && n.risk >= 40 && <circle cx={r * 0.55} cy={-r * 0.55} r="3.5" fill="#f87171" />}
                    <text y={r + 12} fontSize="10" fill="#cbd5e1" textAnchor="middle" className="pointer-events-none">{n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}</text>
                  </g>
                )
              })}
              <text x="12" y="548" fontSize="10" fill="#64748b">Clic sur un nœud : voisinage · un point rouge = contrepartie à risque (score ≥ 40)</text>
            </svg>
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Network className="h-4 w-4" /> {selected ? 'Détail du nœud' : 'Voisinage'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected && <p className="text-sm text-muted-foreground">Sélectionnez un nœud pour explorer ses relations (SERVES, PAYS, SETTLES, OWNS, OPERATED_BY…).</p>}
            {selected && (
              <>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: NODE_COLORS[selected.type] }} />
                  <p className="font-semibold text-sm">{selected.label}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{selected.type}</Badge>
                {Object.entries(selected.meta).length > 0 && (
                  <div className="text-xs space-y-0.5 text-muted-foreground">
                    {Object.entries(selected.meta).map(([k, v]) => (
                      <p key={k}><span className="font-medium text-foreground/80">{k} :</span> {typeof v === 'number' && ['total', 'amount', 'balance', 'price'].includes(k) ? fcfa(v) : String(v)}</p>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5 pt-1 max-h-64 overflow-y-auto">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Relations ({connectedEdges.length})</p>
                  {connectedEdges.map((e) => {
                    const otherId = e.source === selected.id ? e.target : e.source
                    const other = data.nodes.find((n) => n.id === otherId)
                    if (!other) return null
                    return (
                      <button key={e.id} onClick={() => setSelected(other)} className="w-full text-left flex items-center justify-between gap-2 rounded border px-2 py-1.5 hover:bg-accent/40">
                        <span className="text-xs truncate">{other.label}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{e.source === selected.id ? e.relation + ' →' : '← ' + e.relation}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function hoveredEdgeOpacity(id: string, hover: string | null, highlighted: Set<string>): number {
  if (hover && highlighted.has(id)) return 1
  return 0.6
}
