// YAHRIA BUSINESS OS V1 — Policy Engine + Risk Scoring (INV-POL-*, INV-009, INV-010)
import { db } from '@/lib/db'
import { ref, traceId, riskLevelOf, type PolicyDecision } from './core'

export interface PolicyEvaluation {
  decisionId: string
  decision: PolicyDecision
  reason: string
  rules: string[]
  riskScore: number
  riskLevel: string
}

interface PaymentPolicyRules {
  autoApproveBelow: number
  approvalRequiredBelow: number // above this and below denyOver => approval
  denyOver: number
  highRiskScoreThreshold: number
  offHoursBlocked: boolean
}

const DEFAULT_PAYMENT_RULES: PaymentPolicyRules = {
  autoApproveBelow: 250_000, // < 250k FCFA : exécution directe
  approvalRequiredBelow: 2_000_000, // 250k..2M : validation humaine
  denyOver: 10_000_000, // > 10M : bloqué (double signature hors V1)
  highRiskScoreThreshold: 60,
  offHoursBlocked: false,
}

/**
 * Scores transaction risk (0-100). Factors: amount, counterparty risk,
 * method, off-hours, unverified counterparty.
 */
export async function scorePaymentRisk(input: {
  amount: number
  counterpartyName: string
  counterpartyType: string
  method: string
  customerId?: string | null
}): Promise<{ score: number; factors: string[] }> {
  const factors: string[] = []
  let score = 0

  // Amount factor (log scale, up to 40 pts)
  const amountPts = Math.min(40, Math.round((Math.log10(Math.max(input.amount, 1)) / 7) * 40))
  if (amountPts > 5) factors.push(`Montant élevé (+${amountPts})`)
  score += amountPts

  // Counterparty risk
  if (input.customerId) {
    const cust = await db.customer.findUnique({ where: { id: input.customerId } })
    if (cust) score += Math.round(cust.riskScore / 4)
    if (cust && cust.riskScore >= 50) factors.push(`Client à risque (${cust.riskScore}/100)`)
  }
  if (input.counterpartyType === 'OTHER') {
    score += 10
    factors.push('Tiers non catégorisé (+10)')
  }

  // Method factor
  if (input.method === 'CASH') {
    score += 15
    factors.push('Espèces (+15)')
  }
  if (input.method === 'MOBILE_MONEY' && input.amount > 1_000_000) {
    score += 10
    factors.push('Mobile Money > 1M (+10)')
  }

  // Hour factor
  const h = new Date().getHours()
  if (h < 6 || h >= 21) {
    score += 10
    factors.push('Hors heures ouvrées (+10)')
  }

  score = Math.min(100, score)
  return { score, factors }
}

/**
 * Evaluates a payment against PAY-001..PAY-004 policies.
 * Records a traceable, versioned policy decision (INV-POL-002/003).
 */
export async function evaluatePayment(input: {
  orgId: string
  amount: number
  riskScore: number
  actorType: string
}): Promise<PolicyEvaluation> {
  const pol = await db.policy.findUnique({ where: { code: 'PAY-001' } })
  const rules: PaymentPolicyRules = pol?.ruleJson
    ? { ...DEFAULT_PAYMENT_RULES, ...JSON.parse(pol.ruleJson) }
    : DEFAULT_PAYMENT_RULES

  const decisionId = ref('PDC')
  const rulesHit: string[] = []
  let decision: PolicyDecision
  let reason: string

  if (input.amount > rules.denyOver) {
    decision = 'DENY'
    reason = `PAY-003 : montant au-delà du plafond V1 (${rules.denyOver.toLocaleString('fr-FR')} FCFA) — double signature requise`
    rulesHit.push('PAY-003')
  } else if (input.actorType === 'AGENT' && input.amount > rules.autoApproveBelow) {
    decision = 'REQUIRE_APPROVAL'
    reason = `INV-009 : action d'agent au-delà du seuil d'autonomie (${rules.autoApproveBelow.toLocaleString('fr-FR')} FCFA) — validation humaine requise`
    rulesHit.push('INV-009', 'PAY-002')
  } else if (input.amount >= rules.autoApproveBelow) {
    decision = 'REQUIRE_APPROVAL'
    reason = `PAY-002 : montant ≥ ${rules.autoApproveBelow.toLocaleString('fr-FR')} FCFA — approbation humaine requise`
    rulesHit.push('PAY-002')
  } else if (input.riskScore >= rules.highRiskScoreThreshold) {
    decision = 'REQUIRE_APPROVAL'
    reason = `PAY-004 : score de risque ${input.riskScore} ≥ ${rules.highRiskScoreThreshold} — revue requise`
    rulesHit.push('PAY-004')
  } else {
    decision = 'ALLOW'
    reason = `PAY-001 : montant < ${rules.autoApproveBelow.toLocaleString('fr-FR')} FCFA et risque maîtrisé — exécution directe`
    rulesHit.push('PAY-001')
  }

  // Persist decision trace (in DB via audit record with dedicated meta)
  await db.auditRecord.create({
    data: {
      orgId: input.orgId,
      traceId: traceId(),
      actorType: 'SYSTEM',
      actorId: 'policy-engine',
      actorName: 'Policy Engine',
      action: 'POLICY_DECISION',
      resourceType: 'PAYMENT_POLICY',
      resourceId: decisionId,
      summary: `Décision ${decision} — ${reason}`,
      metaJson: JSON.stringify({ decision, rules: rulesHit, riskScore: input.riskScore, version: pol?.version ?? 1 }),
    },
  })

  return {
    decisionId,
    decision,
    reason,
    rules: rulesHit,
    riskScore: input.riskScore,
    riskLevel: riskLevelOf(input.riskScore),
  }
}

/**
 * INV-010 — Agent least privilege: verifies the agent owns the tool it wants to use.
 */
export function checkAgentPermission(agent: {
  capabilities: string
  readOnly: boolean
  maxAmount: number
  autonomyLevel: string
}, intent: string, proposedAmount: number): { ok: boolean; detail: string } {
  const caps: string[] = JSON.parse(agent.capabilities || '[]')
  const normIntent = intent.toUpperCase().replace(/[_-]/g, ' ')
  const matched = caps.some((c) => normIntent.includes(c.toUpperCase().replace(/[_-]/g, ' ')))
  if (!matched && caps.length > 0) {
    return { ok: false, detail: `INV-010 : capacité requise absente du périmètre de l'agent [${caps.join(', ')}]` }
  }
  if (proposedAmount > agent.maxAmount) {
    return {
      ok: false,
      detail: `INV-010 : montant ${proposedAmount.toLocaleString('fr-FR')} > plafond agent ${agent.maxAmount.toLocaleString('fr-FR')} FCFA`,
    }
  }
  return { ok: true, detail: 'Périmètre conforme (moindre privilège)' }
}
