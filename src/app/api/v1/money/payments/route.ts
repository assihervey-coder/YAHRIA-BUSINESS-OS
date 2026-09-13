import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, can } from '@/lib/yahria/auth'
import { orchestratePayment } from '@/lib/yahria/payments'
import { resolveAgentApproval } from '@/lib/yahria/agents'
import { audit } from '@/lib/yahria/audit'

export async function GET(req: NextRequest) {
  return withAuth(req, 'money.read', async (s) => {
    const orgId = s.orgId
  const [accounts, payments] = await Promise.all([
    db.paymentAccount.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } }),
    db.payment.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 60, include: { invoice: { select: { number: true } } } }),
  ])
  const reconciliations = await db.reconciliation.findMany({
    where: { orgId }, orderBy: { reconciledAt: 'desc' }, take: 20,
    include: { payment: { select: { reference: true, counterpartyName: true } } },
  })
  return NextResponse.json({
    accounts,
    payments: payments.map((p) => ({ ...p, invoiceNumber: p.invoice?.number ?? null, invoice: undefined })),
    reconciliations,
  })
  })
}

export async function PATCH(req: NextRequest) {
  return withAuth(req, 'money.reconcile', async (s) => {
    const orgId = s.orgId
    const body = await req.json()
  if (body.action === 'RECONCILE' && body.paymentId) {
    const payment = await db.payment.findUnique({ where: { id: body.paymentId } })
    if (!payment || payment.orgId !== orgId) return NextResponse.json({ error: 'Paiement introuvable' }, { status: 404 })
    if (payment.status !== 'EXECUTED') return NextResponse.json({ error: 'Seul un paiement exécuté peut être rapproché (INV-REC-001)' }, { status: 409 })
    const amount = body.amount ?? payment.amount
    await db.reconciliation.create({
      data: {
        orgId, paymentId: payment.id, externalRef: body.externalRef ?? `MAN-${Date.now()}`,
        provider: payment.provider, amount, matched: true, variance: 0,
        note: 'Rapprochement manuel opérateur (INV-REC-002)',
      },
    })
    await db.payment.update({ where: { id: payment.id }, data: { status: 'RECONCILED' } })
    await audit({
      orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name, action: 'PAYMENT_RECONCILED',
      resourceType: 'PAYMENT', resourceId: payment.id,
      summary: `Rapprochement ${payment.reference} — ${body.externalRef ?? 'manuel'} par ${s.name}`,
    })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  })
}

export async function POST(req: NextRequest) {
  return withAuth(req, 'money.pay.create', async (s) => {
    const orgId = s.orgId
    const body = await req.json()

    // Approvals inbox actions are handled on /agents/approvals — passthrough here for convenience
    if (body.action === 'APPROVE_PAYMENT' && body.approvalId) {
      if (!can(s.role, 'approvals.decide')) {
        return NextResponse.json({ error: `Approbation réservée aux rôles CFO/ADMIN/OWNER — rôle courant : ${s.role}` }, { status: 403 })
      }
      const result = await resolveAgentApproval(body.approvalId, true, s.name, body.note)
      return NextResponse.json({ approval: result })
    }

  try {
    const out = await orchestratePayment({
      orgId,
      type: body.type,
      amount: Number(body.amount),
      counterpartyName: body.counterpartyName,
      counterpartyType: body.counterpartyType ?? 'OTHER',
      method: body.method ?? 'BANK_TRANSFER',
      provider: body.provider ?? null,
      sourceAccountId: body.sourceAccountId ?? null,
      destAccountId: body.destAccountId ?? null,
      invoiceId: body.invoiceId ?? null,
      customerId: body.customerId ?? null,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      initiatedByType: 'HUMAN',
      initiatedByName: s.name,
    })
    return NextResponse.json({
      payment: out.payment,
      replayed: out.replayed,
      traceId: out.traceId,
      decision: 'decision' in out ? out.decision : null,
    }, { status: out.replayed ? 200 : 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  })
}
