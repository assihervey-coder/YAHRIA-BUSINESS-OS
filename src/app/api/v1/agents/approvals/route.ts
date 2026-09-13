import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { resolveAgentApproval } from '@/lib/yahria/agents'

export async function GET() {
  const orgId = await getPrimaryOrgId()
  const approvals = await db.approval.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 40 })
  return NextResponse.json({ items: approvals })
}

export async function POST(req: NextRequest) {
  const orgId = await getPrimaryOrgId()
  void orgId
  const body = await req.json()
  if (!body.approvalId || !body.decision) {
    return NextResponse.json({ error: 'approvalId et decision requis' }, { status: 400 })
  }
  try {
    const approval = await resolveAgentApproval(
      body.approvalId,
      body.decision === 'APPROVED',
      body.decidedBy || 'Awa Koné (DG)',
      body.note
    )
    return NextResponse.json({ approval })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
