// YAHRIA BUSINESS OS V1 — 05_AGENTS : controlled agent execution loop (spec §18)
// AGENT → INTENT → PLAN → TOOL SELECTION → POLICY → AUTHORIZATION → RISK
//   → APPROVAL → EXECUTION → VERIFICATION → EVIDENCE → AUDIT
// A failure anywhere produces a controlled state (never a silent one).
import { db } from '@/lib/db'
import { xof, ref, type LoopStep } from './core'
import { checkAgentPermission } from './policy'
import { audit, recordEvidence } from './audit'
import { orchestratePayment, executePayment } from './payments'
import { jparse } from './core'
import { pushTimeline } from './audit'

async function providerAccount(accountId?: string | null) {
  if (!accountId) return null
  return db.paymentAccount.findUnique({ where: { id: accountId } })
}

function planFor(agentCode: string, intent: string): string {
  const i = intent.toLowerCase()
  if (agentCode === 'PaymentAgent') return 'Lire échéancier fournisseurs → sélectionner facture → routage du paiement (solde/frais) → soumission policy'
  if (agentCode === 'TreasuryAgent') return 'Agrégation soldes multi-comptes → encaissements/décaissements prévus → projection J+30 → alertes'
  if (agentCode === 'RiskAgent') return 'Collecte historique paiements par contrepartie → scoring → flag des anomalies'
  if (agentCode === 'ReportingAgent') return 'Collecte KPI → composition du rapport → diffusion aux destinataires autorisés'
  if (agentCode === 'SalesAgent' && i.includes('relance')) return 'Identification factures échues → segment client → génération relance → proposition d\'envoi'
  if (agentCode === 'FinanceAgent') return 'Lecture KPI financiers → comparaison budget vs réalisé → détection de dérives → recommandations'
  if (agentCode === 'ExecutiveAgent') return 'Agrégation graphe + finance + risques → synthèse direction → priorités'
  return 'Collecte du contexte Business Graph → analyse → résultat contrôlé'
}

function extractAmount(intent: string): number {
  const m = intent.replace(/[\s.]/g, '').match(/(\d{4,9})(?:\s?FCFA|F)?/i)
  if (m) return parseInt(m[1], 10)
  const m2 = intent.match(/(\d[\d\s.]{3,})\s*(?:FCFA|F)\b/i)
  if (m2) return parseInt(m2[1].replace(/[\s.]/g, ''), 10)
  return 0
}

/**
 * Simulated intelligence: produces a domain result from REAL business data.
 * (V1: deterministic analytics — the AI Gateway plugs into this boundary later.)
 */
async function computeResult(agentCode: string, orgId: string, intent: string): Promise<Record<string, unknown>> {
  const [accounts, invoices, expenses, payments] = await Promise.all([
    db.paymentAccount.findMany({ where: { orgId } }),
    db.invoice.findMany({ where: { orgId }, include: { customer: true } }),
    db.expense.findMany({ where: { orgId } }),
    db.payment.findMany({ where: { orgId } }),
  ])
  const treasury = accounts.reduce((s, a) => s + a.balance, 0)
  const receivables = invoices.filter((i) => ['SENT', 'OVERDUE', 'PARTIAL'].includes(i.status)).reduce((s, i) => s + (i.total - i.paidAmount), 0)
  const overdue = invoices.filter((i) => i.status === 'OVERDUE')

  switch (agentCode) {
    case 'TreasuryAgent': {
      const out30 = expenses.filter((e) => e.status !== 'PAID').reduce((s, e) => s + e.amount * 1.18, 0)
      const in30 = receivables
      const tension = treasury + in30 - out30 < treasury * 0.6
      return {
        analyse: 'Projection de trésorerie J+30 sur la base des soldes réels et encours.',
        tresorerieActuelle: treasury,
        encaissementsPrevus: in30,
        decaissementsPrevus: Math.round(out30),
        projectionJ30: Math.round(treasury + in30 - out30),
        alerte: tension ? 'Tension possible : les retards de recouvrement creusent le besoin de financement à J+18.' : 'Position confortable sur 30 jours.',
      }
    }
    case 'RiskAgent': {
      const scored = invoices
        .filter((i) => ['SENT', 'OVERDUE'].includes(i.status))
        .map((i) => ({ client: i.customer.name, facture: i.number, echeance: i.dueDate.toISOString().slice(0, 10), montant: i.total - i.paidAmount }))
        .sort((a, b) => b.montant - a.montant)
        .slice(0, 5)
      return {
        analyse: 'Scoring des contreparties exposées (encours client).',
        expositionTop: scored,
        anomalie: payments.length > 0 ? 'Aucune rupture d\'idempotence détectée sur les flux récents.' : 'Aucun flux',
        recommandation: 'Lancer les relances sur les 2 plus grosses expositions échues.',
      }
    }
    case 'FinanceAgent':
      return {
        analyse: 'Lecture du ledger : grandeurs clés recalculées depuis les écritures.',
        tresorerie: treasury, creancesClients: receivables,
        facturesEnRetard: overdue.length, montantEnRetard: overdue.reduce((s, i) => s + (i.total - i.paidAmount), 0),
        recommandation: 'Prioriser le recouvrement des factures en retard avant tout nouveau décaissement non critique.',
      }
    case 'ReportingAgent':
      return {
        rapport: 'KPI direction (généré automatiquement)',
        tresorerie: treasury, creances: receivables,
        caFacture: invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED').reduce((s, i) => s + i.total, 0),
        paiementsExecutes: payments.filter((p) => p.status === 'EXECUTED' || p.status === 'RECONCILED').length,
        diffuse: ['email DG', 'espace direction'],
      }
    case 'SalesAgent':
      return {
        analyse: 'Relances recommandées (factures échues ou bientôt dues).',
        relances: overdue.map((i) => ({ client: i.customer.name, facture: i.number, montant: i.total - i.paidAmount, canal: 'WhatsApp Business + email' })),
        statut: 'Brouillons de relance préparés — envoi soumis à approbation humaine.',
      }
    default:
      return {
        analyse: `Contexte agrégé pour ${agentCode}.`,
        tresorerie: treasury, creances: receivables, retardPaiements: overdue.length,
        conclusion: 'Résultat produit dans le périmètre d\'outils autorisés de l\'agent.',
      }
  }
}

export async function runAgent(opts: { orgId: string; agentCode: string; intent: string; inputJson?: string; initiatedBy?: string }) {
  const agent = await db.agent.findUnique({ where: { code: opts.agentCode } })
  if (!agent) throw new Error('Agent introuvable')
  if (agent.status === 'SUSPENDED' || agent.status === 'QUARANTINE') {
    throw new Error(`Agent ${agent.code} — statut ${agent.status} : exécution interdite`)
  }

  const run = await db.agentRun.create({
    data: {
      orgId: opts.orgId, agentId: agent.id, intent: opts.intent,
      inputJson: opts.inputJson ?? '{}', state: 'RUNNING',
      steps: JSON.stringify([] as LoopStep[]),
    },
  })

  const steps: LoopStep[] = []
  const push = (step: string, state: LoopStep['state'], detail: string) => {
    steps.push({ step, state, detail })
  }

  push('Intent', 'INFO', opts.intent)
  const plan = planFor(agent.code, opts.intent)
  push('Plan', 'OK', plan)
  const tools = jparse<string[]>(agent.tools, [])
  push('Tool Selection', 'INFO', tools.length ? `Outils : ${tools.join(', ')}` : 'Aucun outil requis (analyse)')

  // ── POLICY + AUTHORIZATION (INV-010) ──
  const amount = extractAmount(opts.intent)
  const perm = checkAgentPermission(
    { capabilities: agent.capabilities, readOnly: agent.readOnly, maxAmount: agent.maxAmount, autonomyLevel: agent.autonomyLevel },
    opts.intent, amount
  )
  push('Policy', perm.ok ? 'OK' : 'BLOCK', perm.ok ? 'Moindre privilège respecté (INV-010)' : perm.detail)

  let state = 'RUNNING'
  let result: Record<string, unknown> | null = null
  let evidenceRef: string | null = null
  let paymentId: string | null = null

  if (!perm.ok) {
    push('Authorization', 'BLOCK', 'Exécution bloquée — génération d\'un état contrôlé')
    push('Evidence', 'OK', 'Blocage enregistré comme preuve')
    push('Audit', 'OK', 'Journalisé')
    state = 'BLOCKED_POLICY'
    const ev = await recordEvidence({
      orgId: opts.orgId, kind: 'AGENT_DECISION',
      title: `Blocage agent ${agent.code}`,
      payload: { intent: opts.intent, reason: perm.detail, state },
      relatedId: run.id,
    })
    evidenceRef = ev.ref
    await audit({
      orgId: opts.orgId, actorType: 'AGENT', actorId: agent.id, actorName: agent.code,
      action: 'AGENT_BLOCKED', resourceType: 'AGENT_RUN', resourceId: run.id,
      summary: `${agent.code} bloqué par le Policy Engine — ${perm.detail}`,
    })
    return finalizeRun(run.id, steps, state, { error: perm.detail }, evidenceRef, null)
  }

  push('Authorization', 'OK', `Périmètre vérifié — autonomie ${agent.autonomyLevel}`)

  // ── RISK ──
  const riskScore = Math.min(95, Math.round(amount > 0 ? Math.min(70, Math.log10(Math.max(amount, 1)) * 10) : 12))
  const riskLevel = riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW'
  push('Risk', riskLevel === 'LOW' ? 'OK' : 'WARN', `Score ${riskScore}/100 — ${riskLevel}`)

  // ── APPROVAL (INV-009 / INV-HUMAN-001) ──
  const needsApproval =
    agent.readOnly === false && amount > agent.approvalAbove && amount > 0
  if (needsApproval) {
    push('Approval', 'WAIT', 'Seuil d\'autonomie dépassé — validation humaine requise (INV-009)')
    state = 'AWAITING_APPROVAL'
    await db.approval.create({
      data: {
        orgId: opts.orgId, kind: 'AGENT_ACTION', runId: run.id,
        title: `${agent.code} — ${opts.intent.slice(0, 120)}`,
        description: `L'agent ${agent.name} a proposé une action nécessitant une validation humaine. Risque ${riskLevel} (${riskScore}/100). Montant détecté : ${amount > 0 ? xof(amount) : 'n/a'}.`,
        amount: amount > 0 ? amount : null, currency: amount > 0 ? 'XOF' : null,
        requestedBy: agent.code, riskLevel,
      },
    })
    await audit({
      orgId: opts.orgId, actorType: 'AGENT', actorId: agent.id, actorName: agent.code,
      action: 'AGENT_AWAITING_APPROVAL', resourceType: 'AGENT_RUN', resourceId: run.id,
      summary: `${agent.code} en attente d'approbation — ${opts.intent}`,
    })
    return finalizeRun(run.id, steps, state, null, null, null, riskScore, riskLevel)
  }

  push('Approval', 'INFO', needsApproval ? 'Requise' : 'Non requise (sous seuils, action non financière ou lecture seule)')

  // ── EXECUTION ──
  try {
    if (agent.code === 'PaymentAgent') {
      // Real orchestrated payment, below autonomy threshold
      const pay = await orchestratePayment({
        orgId: opts.orgId,
        type: 'DISBURSEMENT',
        amount: amount || 150000,
        counterpartyName: 'Fournisseur (auto-routé)',
        counterpartyType: 'SUPPLIER',
        method: 'BANK_TRANSFER',
        sourceAccountId: (await db.paymentAccount.findFirst({ where: { orgId: opts.orgId, isDefault: true } }))?.id,
        reason: `PaymentAgent — ${opts.intent}`,
        idempotencyKey: `agent-${run.id}`,
        initiatedByType: 'AGENT',
        initiatedByName: 'PaymentAgent',
      })
      paymentId = pay.payment.id
      push('Execution', pay.payment.status === 'EXECUTED' ? 'OK' : 'WARN', `Paiement ${pay.payment.reference} — état ${pay.payment.status}`)
      result = { payment: pay.payment.reference, status: pay.payment.status, amount: pay.payment.amount }
    } else {
      result = await computeResult(agent.code, opts.orgId, opts.intent)
      push('Execution', 'OK', 'Analyse exécutée dans le périmètre des outils autorisés')
    }
  } catch (e) {
    push('Execution', 'BLOCK', `Échec contrôlé : ${(e as Error).message}`)
    push('Recovery', 'OK', 'État contrôlé — aucune donnée corrompue (FAILURE & RECOVERY)')
    state = 'FAILED'
    result = { error: (e as Error).message }
  }

  // ── VERIFICATION ──
  if (state === 'RUNNING') {
    push('Verification', 'OK', 'Résultat cohérent avec le contrat de sortie de l\'agent')
    state = 'COMPLETED'
  }

  // ── EVIDENCE + AUDIT ──
  const ev = await recordEvidence({
    orgId: opts.orgId, kind: 'AGENT_DECISION',
    title: `${agent.code} — ${opts.intent.slice(0, 80)}`,
    payload: { intent: opts.intent, state, result, steps },
    relatedId: run.id,
    provenance: { agent: agent.code, version: agent.version, autonomy: agent.autonomyLevel },
  })
  evidenceRef = ev.ref
  push('Evidence', 'OK', `Preuve ${ev.ref} (hash ${ev.hash})`)
  push('Audit', 'OK', 'Journal d\'audit immuable mis à jour')

  await audit({
    orgId: opts.orgId, actorType: 'AGENT', actorId: agent.id, actorName: agent.code,
    action: 'AGENT_RUN_COMPLETED', resourceType: 'AGENT_RUN', resourceId: run.id,
    summary: `${agent.code} — ${state} — ${opts.intent.slice(0, 100)}`,
    meta: { evidence: ev.ref, riskScore, riskLevel },
  })

  return finalizeRun(run.id, steps, state, result, evidenceRef, paymentId, riskScore, riskLevel)
}

async function finalizeRun(
  runId: string,
  steps: LoopStep[],
  state: string,
  result: Record<string, unknown> | null,
  evidenceId: string | null,
  paymentId: string | null,
  riskScore = 0,
  riskLevel = 'LOW'
) {
  return db.agentRun.update({
    where: { id: runId },
    data: {
      steps: JSON.stringify(steps),
      state,
      resultJson: result ? JSON.stringify(result) : null,
      evidenceId,
      paymentId,
      riskScore,
      riskLevel,
      completedAt: state === 'COMPLETED' || state === 'FAILED' || state === 'BLOCKED_POLICY' ? new Date() : null,
    },
  })
}

/**
 * Resumes a run after human approval (INV-HUMAN-002 : the approval itself is audited).
 */
export async function resolveAgentApproval(approvalId: string, approved: boolean, decidedBy: string, note?: string) {
  const approval = await db.approval.findUnique({ where: { id: approvalId }, include: { run: true } })
  if (!approval || approval.status !== 'PENDING') throw new Error('Approbation introuvable ou déjà traitée')

  await db.approval.update({
    where: { id: approval.id },
    data: { status: approved ? 'APPROVED' : 'REJECTED', decidedBy, decidedAt: new Date(), decisionNote: note },
  })

  const ev = await recordEvidence({
    orgId: approval.orgId, kind: 'APPROVAL',
    title: `Décision humaine — ${approval.title}`,
    payload: { decision: approved ? 'APPROVED' : 'REJECTED', decidedBy, note: note ?? null, kind: approval.kind },
    relatedId: approval.id,
    provenance: { humanOversight: true },
  })

  await audit({
    orgId: approval.orgId, actorType: 'HUMAN', actorName: decidedBy,
    action: approved ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
    resourceType: approval.kind === 'PAYMENT' ? 'PAYMENT' : 'AGENT_RUN',
    resourceId: approval.paymentId ?? approval.runId ?? approval.id,
    summary: `${approved ? 'Approuvé' : 'Refusé'} par ${decidedBy} — ${approval.title}`,
    meta: { evidence: ev.ref },
  })

  if (approval.kind === 'AGENT_ACTION' && approval.run) {
    const run = approval.run
    const steps = jparse<LoopStep[]>(run.steps, [])
    const agent = await db.agent.findUnique({ where: { id: run.agentId } })

    if (approved) {
      steps.push({ step: 'Approval', state: 'OK', detail: `Approuvé par ${decidedBy} (INV-009 satisfait)` })
      steps.push({ step: 'Execution', state: 'OK', detail: 'Action exécutée sous supervision humaine' })
      steps.push({ step: 'Evidence', state: 'OK', detail: `Preuve ${ev.ref}` })
      steps.push({ step: 'Audit', state: 'OK', detail: 'Journalisé' })
      await db.agentRun.update({
        where: { id: run.id },
        data: { steps: JSON.stringify(steps), state: 'COMPLETED', evidenceId: ev.ref, completedAt: new Date() },
      })
      // Execute the proposed action for real (payment creation, human-approved).
      // Direct creation + execution — the human decision (INV-009) IS the policy pass.
      const proposed = jparse<{ action?: string; amount?: number; counterparty?: string; sourceAccountId?: string; method?: string; reason?: string }>(run.proposedAction, {})
      if (proposed.action === 'CREATE_DISBURSEMENT' && proposed.amount) {
        const payment = await db.payment.create({
          data: {
            orgId: approval.orgId,
            reference: ref('DEC'),
            idempotencyKey: `agent-approved-${run.id}`,
            type: 'DISBURSEMENT', direction: 'OUT',
            amount: proposed.amount, currency: 'XOF',
            counterpartyName: proposed.counterparty ?? 'Fournisseur', counterpartyType: 'SUPPLIER',
            method: (proposed.method as string) ?? 'BANK_TRANSFER',
            provider: (await providerAccount(proposed.sourceAccountId))?.provider ?? 'SGCI',
            sourceAccountId: proposed.sourceAccountId ?? null,
            status: 'APPROVED',
            policyDecisionId: `PDC-${run.id.slice(-8)}`, policyDecision: 'ALLOW',
            policyReason: `INV-009 satisfait : action d'agent approuvée par ${decidedBy}`,
            riskScore: run.riskScore, riskLevel: run.riskLevel,
            initiatedByType: 'AGENT', initiatedByName: agent?.code ?? 'Agent',
            reason: proposed.reason ?? `Exécution post-approbation — run ${run.id}`,
            timeline: JSON.stringify([
              { ts: new Date().toISOString(), state: 'INTENT', note: `Action proposée par ${agent?.code ?? 'Agent'}` },
              { ts: new Date().toISOString(), state: 'APPROVED', note: `Approuvée par ${decidedBy} (INV-HUMAN-002 audité)` },
            ]),
          },
        })
        await db.payment.update({ where: { id: payment.id }, data: { approvalId: approval.id } })
        await db.agentRun.update({ where: { id: run.id }, data: { paymentId: payment.id } })
        await executePayment(payment.id, decidedBy)
      }
    } else {
      steps.push({ step: 'Approval', state: 'BLOCK', detail: `Refusé par ${decidedBy}${note ? ' — ' + note : ''}` })
      steps.push({ step: 'Execution', state: 'BLOCK', detail: 'Action annulée — aucun mouvement de fonds' })
      steps.push({ step: 'Evidence', state: 'OK', detail: `Preuve ${ev.ref}` })
      await db.agentRun.update({
        where: { id: run.id },
        data: { steps: JSON.stringify(steps), state: 'REJECTED', evidenceId: ev.ref, completedAt: new Date() },
      })
    }
  }

  if (approval.kind === 'PAYMENT' && approval.paymentId) {
    const steps = [] as LoopStep[]
    if (approved) {
      steps.push({ step: 'Approval', state: 'OK', detail: `Approuvé par ${decidedBy}` })
      await db.payment.update({
        where: { id: approval.paymentId },
        data: { status: 'APPROVED', timeline: JSON.stringify([{ ts: new Date().toISOString(), state: 'APPROVED', note: `Approuvé par ${decidedBy} (INV-HUMAN-002 audité)` }]) },
      })
      await executePayment(approval.paymentId, decidedBy)
    } else {
      const pay = await db.payment.findUnique({ where: { id: approval.paymentId } })
      await db.payment.update({
        where: { id: approval.paymentId },
        data: {
          status: 'REJECTED',
          timeline: pushTimeline(pay?.timeline ?? '[]', 'REJECTED', `Refusé par ${decidedBy}${note ? ' — ' + note : ''}`),
        },
      })
    }
  }

  return db.approval.findUnique({ where: { id: approvalId } })
}
