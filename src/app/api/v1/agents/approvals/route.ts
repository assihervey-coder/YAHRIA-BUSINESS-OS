import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/yahria/auth'
import { resolveAgentApproval } from '@/lib/yahria/agents'
import { audit } from '@/lib/yahria/audit'

export async function GET(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const approvals = await db.approval.findMany({ where: { orgId: s.orgId }, orderBy: { createdAt: 'desc' }, take: 40 })
    return NextResponse.json({ items: approvals })
  })
}

export async function POST(req: NextRequest) {
  return withAuth(req, 'approvals.decide', async (s) => {
    const body = await req.json()
    if (!body.approvalId || !body.decision) {
      return NextResponse.json({ error: 'approvalId et decision requis' }, { status: 400 })
    }
    try {
      const approval = await resolveAgentApproval(
        body.approvalId,
        body.decision === 'APPROVED',
        s.name,
        body.note
      )
      await audit({
        orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
        action: body.decision === 'APPROVED' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
        resourceType: 'APPROVAL', resourceId: body.approvalId,
        summary: `${body.decision === 'APPROVED' ? 'Approbation' : 'Rejet'} par ${s.name}${body.note ? ' — ' + body.note : ''}`,
      })
      return NextResponse.json({ approval })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
  })
}
