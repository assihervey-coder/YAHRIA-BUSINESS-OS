import { NextRequest, NextResponse } from 'next/server'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { runAgent } from '@/lib/yahria/agents'

export async function POST(req: NextRequest) {
  const orgId = await getPrimaryOrgId()
  const body = await req.json()
  if (!body.agentCode || !body.intent) {
    return NextResponse.json({ error: 'agentCode et intent requis' }, { status: 400 })
  }
  try {
    const run = await runAgent({ orgId, agentCode: body.agentCode, intent: body.intent })
    return NextResponse.json({ run })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
