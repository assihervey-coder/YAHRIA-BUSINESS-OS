import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/yahria/auth'
import { getGraph, rebuildGraphProjection } from '@/lib/yahria/graph'
import { audit } from '@/lib/yahria/audit'

export async function GET(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const graph = await getGraph(s.orgId)
  // degree for node sizing
  const degree: Record<string, number> = {}
  for (const e of graph.edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1
    degree[e.target] = (degree[e.target] ?? 0) + 1
  }
  return NextResponse.json({
    ...graph,
    stats: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      byType: graph.nodes.reduce((acc, n) => { acc[n.type] = (acc[n.type] ?? 0) + 1; return acc }, {} as Record<string, number>),
    },
  })
  })
}

export async function POST(req: NextRequest) {
  return withAuth(req, 'graph.rebuild', async (s) => {
    const orgId = s.orgId
    const result = await rebuildGraphProjection(orgId)
    await audit({ orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name, action: 'GRAPH_REBUILT', resourceType: 'BUSINESS_GRAPH', summary: `Projection Business Graph reconstruite par ${s.name} — ${result?.nodes ?? 0} nœuds, ${result?.edges ?? 0} arêtes (INV-GRAPH-004)` })
    return NextResponse.json({ ok: true, ...result })
  })
}
