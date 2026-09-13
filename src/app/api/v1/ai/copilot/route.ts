// YAHRIA BUSINESS OS V1 — 04_AI / Executive Intelligence (spec §10)
// QUESTION → BUSINESS CONTEXT (graph + finance + money) → REASONING → ANSWER → EVIDENCE
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/yahria/auth'
import { audit, recordEvidence } from '@/lib/yahria/audit'
import { xof } from '@/lib/yahria/core'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  return withAuth(req, 'copilot.use', async (s) => {
  const orgId = s.orgId
  const { question, history } = await req.json().catch(() => ({ question: '', history: [] }))
  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'Question requise' }, { status: 400 })
  }

  // ── BUSINESS CONTEXT aggregation (RAG-style, sources traced) ──
  const [org, accounts, invoices, expenses, payments, agents, runs] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.paymentAccount.findMany({ where: { orgId } }),
    db.invoice.findMany({ where: { orgId }, include: { customer: true }, orderBy: { issueDate: 'desc' } }),
    db.expense.findMany({ where: { orgId } }),
    db.payment.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.agent.findMany({ where: { orgId } }),
    db.agentRun.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 10, include: { agent: true } }),
  ])

  const treasury = accounts.reduce((s, a) => s + a.balance, 0)
  const open = invoices.filter((i) => ['SENT', 'OVERDUE', 'PARTIAL'].includes(i.status))
  const receivables = open.reduce((s, i) => s + (i.total - i.paidAmount), 0)
  const overdue = invoices.filter((i) => i.status === 'OVERDUE')
  const overdueAmount = overdue.reduce((s, i) => s + (i.total - i.paidAmount), 0)
  const payables = expenses.filter((e) => e.status !== 'PAID').reduce((s, e) => s + e.amount + e.vatAmount, 0)
  const caTotal = invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED').reduce((s, i) => s + i.total, 0)
  const vatCollected = caTotal > 0 ? invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED').reduce((s, i) => s + i.vatAmount, 0) : 0
  const vatDeductible = expenses.reduce((s, e) => s + e.vatAmount, 0)
  const topCustomers = Object.values(
    invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED').reduce((acc, i) => {
      acc[i.customer.name] = acc[i.customer.name] ?? { name: i.customer.name, ca: 0 }
      acc[i.customer.name].ca += i.total
      return acc
    }, {} as Record<string, { name: string; ca: number }>)
  ).sort((a, b) => b.ca - a.ca).slice(0, 5)

  const context = [
    `Organisation : ${org?.legalName} (${org?.city}, ${org?.countryCode}) — secteur ${org?.sectorCode} — devise XOF.`,
    `Trésorerie totale : ${xof(treasury)} répartie sur ${accounts.length} comptes : ${accounts.map((a) => `${a.name} ${xof(a.balance)}`).join(' ; ')}.`,
    `Créances clients en cours : ${xof(receivables)} sur ${open.length} factures ouvertes.`,
    overdue.length
      ? `Factures en retard : ${overdue.length} totalisant ${xof(overdueAmount)} — détail : ${overdue.map((i) => `${i.number} (${i.customer.name}, ${xof(i.total - i.paidAmount)}, échue depuis ${Math.floor((Date.now() - i.dueDate.getTime()) / 86400000)} j)`).join(' ; ')}.`
      : 'Aucune facture en retard.',
    `Dettes fournisseurs/dépenses non réglées : ${xof(payables)}.`,
    `CA facturé cumulé : ${xof(caTotal)}. TVA collectée : ${xof(vatCollected)} ; TVA récupérable : ${xof(vatDeductible)} ; TVA nette estimée : ${xof(vatCollected - vatDeductible)}.`,
    `Top clients par CA facturé : ${topCustomers.map((c) => `${c.name} (${xof(c.ca)})`).join(' ; ')}.`,
    `Agents IA déployés : ${agents.length} (${agents.filter((a) => a.status === 'ACTIVE').length} actifs, ${agents.filter((a) => a.status === 'READONLY').length} en lecture seule). Derniers runs : ${runs.slice(0, 5).map((r) => `${r.agent.code}→${r.state}`).join(', ')}.`,
    `Paiements récents : ${payments.slice(0, 5).map((p) => `${p.reference} ${p.type} ${xof(p.amount)} (${p.status})`).join(' ; ')}.`,
  ].join('\n')

  const system = `Tu es YAHRIA Copilot, l'intelligence exécutive de YAHRIA BUSINESS OS pour une entreprise africaine (OHADA, XOF).
Règles absolues :
1. Tu réponds en français, de façon concise et structurée (max 180 mots). Utilise des puces courtes si utile.
2. Tu t'appuies UNIQUEMENT sur le contexte métier fourni (Business Graph + Finance + Money). Ne invente jamais de chiffres.
3. Si l'information manque, dis-le clairement et propose quelle donnée connecter.
4. Tu es en lecture seule : tu ne peux PAS exécuter d'actions — tu formules des recommandations et tu peux suggérer de déléguer à un agent existant (PaymentAgent, TreasuryAgent, RiskAgent, ReportingAgent, SalesAgent, FinanceAgent, ExecutiveAgent).
5. Cite les sources de données utilisées entre crochets à la fin, ex: [graph.query, finance.kpi.read].
6. Termine par une ligne "Confiance: XX%" estimée.

CONTEXTE MÉTIER (sources tracées) :
${context}`

  const messages: { role: 'assistant' | 'user'; content: string }[] = [
    { role: 'assistant', content: system },
    ...(Array.isArray(history) ? history.slice(-6).map((h: { role: string; content: string }) => ({ role: h.role === 'user' ? 'user' as const : 'user' as const, content: h.content })) : []),
    { role: 'user', content: question },
  ]

  let answer = ''
  let model = 'glm-4.6'
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })
    answer = completion.choices[0]?.message?.content ?? 'Le modèle n\'a pas retourné de réponse.'
  } catch (e) {
    // Controlled degradation (INV: never a silent failure) — deterministic fallback answer
    model = 'fallback-local'
    answer = `**Réponse locale (modèle IA indisponible)**\n\nSynthèse déterministe du contexte métier :\n- Trésorerie : ${xof(treasury)}\n- Créances clients : ${xof(receivables)} dont ${xof(overdueAmount)} en retard sur ${overdue.length} factures\n- Dettes non réglées : ${xof(payables)}\n- TVA nette estimée : ${xof(vatCollected - vatDeductible)}\n\nRecommandation : prioriser le recouvrement des factures échues avant tout nouveau décaissement.\n\n[finance.kpi.read, money.accounts.read]`
    void e
  }

  // ── INV-008 / INV-AI-001..006 : evidence + traceability ──
  const ev = await recordEvidence({
    orgId, kind: 'AI_ANSWER',
    title: `Copilot — ${question.slice(0, 70)}`,
    payload: { question, answer, model, sources: ['graph.query', 'finance.kpi.read', 'money.accounts.read'] },
    provenance: { aiGateway: model, ragSources: ['business_graph', 'finance', 'money'] },
  })
  await audit({
    orgId, actorType: 'SYSTEM', actorName: 'YAHRIA Copilot',
    action: 'AI_ANSWER_PRODUCED', resourceType: 'AI_DECISION', resourceId: ev.ref,
    summary: `Copilot a répondu à : « ${question.slice(0, 90)} » (modèle ${model})`,
    meta: { evidence: ev.ref },
  })

  return NextResponse.json({
    answer,
    model,
    evidenceRef: ev.ref,
    evidenceSignature: ev.signature,
    sources: ['Business Graph', 'FINANCE.kpi', 'MONEY.accounts', 'AGENTS.registry'],
  })
  })
}
