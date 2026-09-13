import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { xof } from '@/lib/yahria/core'

export async function GET() {
  const orgId = await getPrimaryOrgId()
  const [accounts, invoices, expenses, payments, approvals, runs, auditRecords, agents, org] = await Promise.all([
    db.paymentAccount.findMany({ where: { orgId } }),
    db.invoice.findMany({ where: { orgId }, include: { customer: true } }),
    db.expense.findMany({ where: { orgId } }),
    db.payment.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } }),
    db.approval.findMany({ where: { orgId, status: 'PENDING' } }),
    db.agentRun.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, include: { agent: true }, take: 8 }),
    db.auditRecord.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 12 }),
    db.agent.findMany({ where: { orgId } }),
    db.organization.findUnique({ where: { id: orgId } }),
  ])

  const treasury = accounts.reduce((s, a) => s + a.balance, 0)
  const openInvoices = invoices.filter((i) => ['SENT', 'OVERDUE', 'PARTIAL'].includes(i.status))
  const receivables = openInvoices.reduce((s, i) => s + (i.total - i.paidAmount), 0)
  const overdue = invoices.filter((i) => i.status === 'OVERDUE')
  const overdueAmount = overdue.reduce((s, i) => s + (i.total - i.paidAmount), 0)
  const payables = expenses.filter((e) => e.status !== 'PAID').reduce((s, e) => s + e.amount + e.vatAmount, 0)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const caMonth = invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED' && i.issueDate >= monthStart).reduce((s, i) => s + i.total, 0)
  const vatCollected = invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED').reduce((s, i) => s + i.vatAmount, 0)
  const vatDeductible = expenses.reduce((s, e) => s + e.vatAmount, 0)

  // Cash series: last 14 days reconstructed from executed payments
  const days: { day: string; solde: number; encaissements: number; decaissements: number }[] = []
  const now = Date.now()
  for (let d = 13; d >= 0; d--) {
    const dayStart = new Date(now - d * 86400000); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 86400000)
    const moved = payments.filter((p) => p.executedAt && p.executedAt >= dayStart && p.executedAt < dayEnd)
    const inSum = moved.filter((p) => p.direction === 'IN').reduce((s, p) => s + p.amount, 0)
    const outSum = moved.filter((p) => p.direction === 'OUT').reduce((s, p) => s + p.amount, 0)
    days.push({ day: dayStart.toISOString().slice(5, 10), solde: 0, encaissements: inSum, decaissements: outSum })
  }
  // Walk backwards from today's actual treasury balance
  let forward = treasury
  for (let i = days.length - 1; i >= 0; i--) {
    days[i].solde = Math.round(forward)
    forward = forward - days[i].encaissements + days[i].decaissements
  }

  return NextResponse.json({
    org: org ? { name: org.legalName, city: org.city, country: org.countryCode, taxId: org.taxId, rccm: org.rccm, sector: org.sectorCode, currency: org.currencyCode } : null,
    kpis: {
      treasury, receivables, overdueAmount, payables, caMonth, vatCollected, vatDeductible,
      vatNet: vatCollected - vatDeductible,
      overdueCount: overdue.length,
      pendingApprovals: approvals.length,
      activeAgents: agents.filter((a) => a.status === 'ACTIVE').length,
      readonlyAgents: agents.filter((a) => a.status === 'READONLY').length,
    },
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, provider: a.provider, balance: a.balance, isDefault: a.isDefault })),
    cashSeries: days,
    overdueInvoices: overdue.map((i) => ({ id: i.id, number: i.number, customer: i.customer.name, total: i.total - i.paidAmount, dueDate: i.dueDate, daysLate: Math.max(0, Math.floor((Date.now() - i.dueDate.getTime()) / 86400000)) })).sort((a, b) => b.total - a.total),
    pendingApprovals: approvals.map((a) => ({ id: a.id, kind: a.kind, title: a.title, amount: a.amount, riskLevel: a.riskLevel, requestedBy: a.requestedBy })),
    recentRuns: runs.map((r) => ({ id: r.id, agent: r.agent.name, agentCode: r.agent.code, intent: r.intent, state: r.state, riskLevel: r.riskLevel, createdAt: r.createdAt })),
    recentAudit: auditRecords.map((a) => ({ id: a.id, ts: a.createdAt, actor: a.actorName, actorType: a.actorType, action: a.action, summary: a.summary })),
  })
}
