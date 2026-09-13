import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/yahria/auth'
import { jparse } from '@/lib/yahria/core'

export async function GET(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const orgId = s.orgId
  const agents = await db.agent.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } })
  const runs = await db.agentRun.findMany({
    where: { orgId }, orderBy: { createdAt: 'desc' }, take: 40, include: { agent: { select: { code: true, name: true } } },
  })
  return NextResponse.json({
    agents: agents.map((a) => ({
      ...a,
      capabilities: jparse<string[]>(a.capabilities, []),
      tools: jparse<string[]>(a.tools, []),
    })),
    runs: runs.map((r) => ({
      id: r.id, agentCode: r.agent.code, agentName: r.agent.name, intent: r.intent, state: r.state,
      steps: jparse(r.steps, []), riskScore: r.riskScore, riskLevel: r.riskLevel,
      result: jparse<Record<string, unknown> | null>(r.resultJson, null),
      evidenceId: r.evidenceId, createdAt: r.createdAt, completedAt: r.completedAt,
    })),
  })
  })
}
