// YAHRIA BUSINESS OS V1 — 01_MONEY : Payment orchestration service
// Lifecycle (spec §18): DISCOVERY → INTENT → VALIDATION → POLICY CHECK → RISK CHECK
//   → APPROVAL → EXECUTION → RECONCILIATION → ACCOUNTING → EVIDENCE → AUDIT
import { db } from '@/lib/db'
import { ref, traceId, xof } from './core'
import { evaluatePayment, scorePaymentRisk } from './policy'
import { audit, recordEvidence, pushTimeline } from './audit'
import { applyAccountDelta, postEntry } from './ledger'

export interface CreatePaymentInput {
  orgId: string
  type: 'COLLECTION' | 'DISBURSEMENT' | 'TRANSFER'
  amount: number
  counterpartyName: string
  counterpartyType: 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'INTERNAL' | 'OTHER'
  method: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'WALLET'
  provider?: string
  sourceAccountId?: string | null
  destAccountId?: string | null
  invoiceId?: string | null
  customerId?: string | null
  reason?: string
  idempotencyKey: string
  initiatedByType?: 'HUMAN' | 'AGENT' | 'SYSTEM'
  initiatedByName?: string
}

function treasuryCode(provider?: string | null): string {
  if (!provider) return '571'
  if (provider === 'SGCI' || provider === 'BICICI' || provider === 'SGSN' || provider === 'BOA_SN') return '521'
  if (provider === 'WAVE') return '5212'
  if (provider === 'CAISSE') return '571'
  return '522'
}

/**
 * Executes an already-approved payment: moves money (MONEY layer), posts the
 * balanced accounting entry (FINANCE layer), records evidence + audit.
 */
export async function executePayment(paymentId: string, approvedBy?: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new Error('Paiement introuvable')
  if (payment.status === 'EXECUTED' || payment.status === 'RECONCILED') return payment // idempotent

  let timeline = payment.timeline
  const fee = payment.type === 'COLLECTION' && payment.method === 'MOBILE_MONEY' ? Math.round(payment.amount * 0.01) : 0

  // MONEY layer: account deltas
  if (payment.type === 'COLLECTION' && payment.destAccountId) {
    await applyAccountDelta(payment.destAccountId, payment.amount - fee)
  }
  if (payment.type === 'DISBURSEMENT' && payment.sourceAccountId) {
    await applyAccountDelta(payment.sourceAccountId, -payment.amount)
  }
  if (payment.type === 'TRANSFER') {
    if (payment.sourceAccountId) await applyAccountDelta(payment.sourceAccountId, -payment.amount)
    if (payment.destAccountId) await applyAccountDelta(payment.destAccountId, payment.amount)
  }

  // Invoice linkage (collections settle invoices)
  if (payment.type === 'COLLECTION' && payment.invoiceId) {
    const inv = await db.invoice.findUnique({ where: { id: payment.invoiceId } })
    if (inv) {
      const paid = Math.min(inv.total, inv.paidAmount + payment.amount)
      const status = paid >= inv.total ? 'PAID' : 'PARTIAL'
      await db.invoice.update({ where: { id: inv.id }, data: { paidAmount: paid, status } })
    }
  }

  // FINANCE layer: balanced double-entry
  try {
    if (payment.type === 'COLLECTION') {
      const t = treasuryCode(payment.provider)
      await postEntry({
        orgId: payment.orgId, reference: `ENC/${payment.reference}`,
        description: `Encaissement ${payment.counterpartyName} — ${payment.reason ?? ''}`,
        source: 'PAYMENT', sourceId: payment.id,
        lines: [
          { accountCode: t, debit: payment.amount - fee },
          ...(fee > 0 ? [{ accountCode: '661', debit: fee }] : []),
          { accountCode: '411', credit: payment.amount },
        ],
      })
    } else if (payment.type === 'DISBURSEMENT') {
      const t = treasuryCode(payment.provider)
      const chargeAcc =
        payment.counterpartyType === 'EMPLOYEE' ? '422' : payment.counterpartyType === 'SUPPLIER' ? '401' : '401'
      await postEntry({
        orgId: payment.orgId, reference: `DEC/${payment.reference}`,
        description: `Décaissement ${payment.counterpartyName} — ${payment.reason ?? ''}`,
        source: 'PAYMENT', sourceId: payment.id,
        lines: [
          { accountCode: chargeAcc, debit: payment.amount },
          { accountCode: t, credit: payment.amount },
        ],
      })
    } else {
      // TRANSFER between own accounts — treasury vs treasury (offsetting)
      const src = treasuryCode(await providerOf(payment.sourceAccountId))
      const dst = treasuryCode(await providerOf(payment.destAccountId))
      await postEntry({
        orgId: payment.orgId, reference: `VIR/${payment.reference}`,
        description: `Virement interne — ${payment.reason ?? ''}`,
        source: 'PAYMENT', sourceId: payment.id,
        lines: [
          { accountCode: dst, debit: payment.amount },
          { accountCode: src, credit: payment.amount },
        ],
      })
    }
  } catch (e) {
    // INV-ACC-001 violation or ledger failure => controlled failure state
    timeline = pushTimeline(timeline, 'FAILED', `Écriture refusée : ${(e as Error).message}`)
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', timeline },
    })
    await audit({
      orgId: payment.orgId, actorType: 'SYSTEM', action: 'PAYMENT_FAILED',
      resourceType: 'PAYMENT', resourceId: payment.id,
      summary: `Échec d'exécution : ${(e as Error).message}`,
    })
    throw e
  }

  timeline = pushTimeline(timeline, 'EXECUTED', approvedBy ? `Exécuté après approbation de ${approvedBy}` : 'Exécuté (policy ALLOW)')

  const ev = await recordEvidence({
    orgId: payment.orgId,
    kind: 'PAYMENT',
    title: `Paiement ${payment.reference} — ${payment.type}`,
    payload: {
      reference: payment.reference, type: payment.type, amount: payment.amount,
      currency: payment.currency, counterparty: payment.counterpartyName,
      method: payment.method, provider: payment.provider,
      fee, approvedBy: approvedBy ?? null,
      accounting: 'Écriture double-partie postée (INV-ACC-001 vérifiée)',
    },
    relatedId: payment.id,
    provenance: { initiatedByType: payment.initiatedByType, initiatedBy: payment.initiatedByName },
  })

  const updated = await db.payment.update({
    where: { id: payment.id },
    data: {
      status: 'EXECUTED', executedAt: new Date(), fee,
      evidenceId: ev.ref, timeline,
    },
  })

  await audit({
    orgId: payment.orgId,
    actorType: payment.initiatedByType === 'AGENT' ? 'AGENT' : 'HUMAN',
    actorName: payment.initiatedByName,
    action: 'PAYMENT_EXECUTED',
    resourceType: 'PAYMENT',
    resourceId: payment.id,
    summary: `${payment.type === 'COLLECTION' ? 'Encaissement' : payment.type === 'DISBURSEMENT' ? 'Décaissement' : 'Virement'} ${payment.reference} — ${xof(payment.amount)} — ${payment.counterpartyName}`,
    meta: { evidence: ev.ref, riskScore: payment.riskScore, policy: payment.policyDecision },
  })

  return updated
}

async function providerOf(accountId?: string | null): Promise<string | null> {
  if (!accountId) return null
  const acc = await db.paymentAccount.findUnique({ where: { id: accountId } })
  return acc?.provider ?? null
}

/**
 * Full orchestration pipeline for a new payment (spec §3 + §18).
 */
export async function orchestratePayment(input: CreatePaymentInput) {
  const trc = traceId()

  // ── INV-006 / INV-FIN-002 : idempotency ──
  const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) {
    return { payment: existing, replayed: true, traceId: trc }
  }

  // Validation
  if (!(input.amount > 0)) throw new Error('Montant invalide')
  if (input.type === 'COLLECTION' && !input.destAccountId) throw new Error('Compte de destination requis')
  if (input.type === 'DISBURSEMENT' && !input.sourceAccountId) throw new Error('Compte source requis')

  // ── Solvency guard (INV-FIN-003) : no negative treasury balance ──
  if (input.sourceAccountId) {
    const src = await db.paymentAccount.findUnique({ where: { id: input.sourceAccountId } })
    if (src && src.balance < input.amount) {
      const timeline = pushTimeline('[]', 'REJECTED', `Fonds insuffisants sur ${src.name} : ${xof(src.balance)} < ${xof(input.amount)}`)
      const rejected = await db.payment.create({
        data: {
          orgId: input.orgId,
          reference: ref(input.type === 'COLLECTION' ? 'ENC' : input.type === 'DISBURSEMENT' ? 'DEC' : 'VIR'),
          idempotencyKey: input.idempotencyKey,
          type: input.type, direction: input.type === 'COLLECTION' ? 'IN' : input.type === 'DISBURSEMENT' ? 'OUT' : 'INTERNAL',
          amount: input.amount, currency: 'XOF',
          counterpartyName: input.counterpartyName, counterpartyType: input.counterpartyType,
          method: input.method,
          provider: input.provider ?? src.provider,
          sourceAccountId: input.sourceAccountId ?? null,
          destAccountId: input.destAccountId ?? null,
          invoiceId: input.invoiceId ?? null,
          status: 'REJECTED',
          policyDecisionId: ref('PDC'), policyDecision: 'DENY',
          policyReason: `INV-FIN-003 : fonds insuffisants sur ${src.name} (${xof(src.balance)} disponibles)`,
          riskScore: 70, riskLevel: 'HIGH',
          initiatedByType: input.initiatedByType ?? 'HUMAN',
          initiatedByName: input.initiatedByName ?? 'Awa Koné',
          reason: input.reason, timeline,
        },
      })
      await audit({
        orgId: input.orgId, actorType: 'SYSTEM', action: 'PAYMENT_DENIED',
        resourceType: 'PAYMENT', resourceId: rejected.id,
        summary: `Paiement ${rejected.reference} bloqué — fonds insuffisants sur ${src.name}`,
        meta: { traceId: trc },
      })
      return { payment: rejected, replayed: false, traceId: trc }
    }
  }

  let timeline = JSON.stringify([])
  timeline = pushTimeline(timeline, 'INTENT', `Intention : ${input.type} ${xof(input.amount)} — ${input.counterpartyName}`)

  const payment = await db.payment.create({
    data: {
      orgId: input.orgId,
      reference: ref(input.type === 'COLLECTION' ? 'ENC' : input.type === 'DISBURSEMENT' ? 'DEC' : 'VIR'),
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      direction: input.type === 'COLLECTION' ? 'IN' : input.type === 'DISBURSEMENT' ? 'OUT' : 'INTERNAL',
      amount: input.amount,
      currency: 'XOF',
      counterpartyName: input.counterpartyName,
      counterpartyType: input.counterpartyType,
      method: input.method,
      provider: input.provider ?? (input.type === 'COLLECTION' ? await providerOf(input.destAccountId) : await providerOf(input.sourceAccountId)) ?? 'SGCI',
      sourceAccountId: input.sourceAccountId ?? null,
      destAccountId: input.destAccountId ?? null,
      invoiceId: input.invoiceId ?? null,
      status: 'PENDING_POLICY',
      initiatedByType: input.initiatedByType ?? 'HUMAN',
      initiatedByName: input.initiatedByName ?? 'Awa Koné',
      reason: input.reason,
      timeline,
    },
  })

  // ── RISK CHECK ──
  const risk = await scorePaymentRisk({
    amount: input.amount,
    counterpartyName: input.counterpartyName,
    counterpartyType: input.counterpartyType,
    method: input.method,
    customerId: input.customerId,
  })

  // ── POLICY CHECK ──
  const decision = await evaluatePayment({
    orgId: input.orgId,
    amount: input.amount,
    riskScore: risk.score,
    actorType: input.initiatedByType ?? 'HUMAN',
  })

  timeline = pushTimeline(payment.timeline, 'RISK_CHECK', `Score ${risk.score}/100 (${risk.factors.join(' ; ') || 'aucun facteur aggravant'})`)
  timeline = pushTimeline(timeline, 'POLICY_CHECK', `${decision.decision} — ${decision.reason}`)

  if (decision.decision === 'DENY') {
    timeline = pushTimeline(timeline, 'REJECTED', 'Bloqué par la politique — aucun mouvement de fonds')
    const ev = await recordEvidence({
      orgId: input.orgId, kind: 'POLICY',
      title: `Paiement bloqué — ${payment.reference}`,
      payload: { decision: 'DENY', reason: decision.reason, riskScore: risk.score, rules: decision.rules },
      relatedId: payment.id,
    })
    const rejected = await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REJECTED',
        riskScore: risk.score, riskLevel: decision.riskLevel,
        policyDecisionId: decision.decisionId, policyDecision: decision.decision, policyReason: decision.reason,
        evidenceId: ev.ref, timeline,
      },
    })
    await audit({
      orgId: input.orgId, actorType: 'SYSTEM', action: 'PAYMENT_DENIED',
      resourceType: 'PAYMENT', resourceId: payment.id,
      summary: `Paiement ${payment.reference} bloqué par le Policy Engine — ${decision.reason}`,
      meta: { traceId: trc },
    })
    return { payment: rejected, replayed: false, traceId: trc, decision, risk }
  }

  if (decision.decision === 'REQUIRE_APPROVAL') {
    timeline = pushTimeline(timeline, 'PENDING_APPROVAL', 'En attente de validation humaine (INV-009)')
    const approval = await db.approval.create({
      data: {
        orgId: input.orgId, kind: 'PAYMENT', paymentId: payment.id,
        title: `${input.type === 'COLLECTION' ? 'Encaissement' : input.type === 'DISBURSEMENT' ? 'Décaissement' : 'Virement'} ${xof(input.amount)} — ${input.counterpartyName}`,
        description: `${decision.reason}. Risque : ${decision.riskLevel} (${risk.score}/100).${input.reason ? ' Motif : ' + input.reason : ''}`,
        amount: input.amount, currency: 'XOF',
        requestedBy: input.initiatedByName ?? 'Awa Koné',
        riskLevel: decision.riskLevel,
      },
    })
    const pending = await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PENDING_APPROVAL',
        riskScore: risk.score, riskLevel: decision.riskLevel,
        policyDecisionId: decision.decisionId, policyDecision: decision.decision, policyReason: decision.reason,
        approvalId: approval.id, timeline,
      },
    })
    await audit({
      orgId: input.orgId,
      actorType: input.initiatedByType === 'AGENT' ? 'AGENT' : 'HUMAN',
      actorName: input.initiatedByName ?? 'Awa Koné',
      action: 'PAYMENT_AWAITING_APPROVAL',
      resourceType: 'PAYMENT', resourceId: payment.id,
      summary: `Paiement ${payment.reference} en attente d'approbation — ${decision.reason}`,
      meta: { traceId: trc },
    })
    return { payment: pending, replayed: false, traceId: trc, decision, risk, approvalId: approval.id }
  }

  // ALLOW → execute now
  const approved = await db.payment.update({
    where: { id: payment.id },
    data: {
      riskScore: risk.score, riskLevel: decision.riskLevel,
      policyDecisionId: decision.decisionId, policyDecision: decision.decision, policyReason: decision.reason,
      timeline,
    },
  })
  const executed = await executePayment(approved.id)
  return { payment: executed, replayed: false, traceId: trc, decision, risk }
}
