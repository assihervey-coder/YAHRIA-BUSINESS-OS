// YAHRIA BUSINESS OS V1 — 03_BUSINESS_GRAPH : projection engine (INV-GRAPH-004)
// The Graph is a rebuildable projection of CORE / MONEY / FINANCE state —
// it is never the primary source of truth (INV-GRAPH-003).
import { db } from '@/lib/db'

export async function rebuildGraphProjection(orgId: string) {
  await db.graphEdge.deleteMany({ where: { orgId } })
  await db.graphNode.deleteMany({ where: { orgId } })

  const [org, customers, suppliers, employees, products, accounts, invoices, expenses, agents, payments] =
    await Promise.all([
      db.organization.findUnique({ where: { id: orgId } }),
      db.customer.findMany({ where: { orgId } }),
      db.supplier.findMany({ where: { orgId } }),
      db.employee.findMany({ where: { orgId } }),
      db.product.findMany({ where: { orgId } }),
      db.paymentAccount.findMany({ where: { orgId } }),
      db.invoice.findMany({ where: { orgId }, include: { customer: true } }),
      db.expense.findMany({ where: { orgId } }),
      db.agent.findMany({ where: { orgId } }),
      db.payment.findMany({ where: { orgId } }),
    ])
  if (!org) return

  type NodeSeed = {
    nodeType: string
    refId: string
    label: string
    meta: Record<string, unknown>
    risk?: number
  }
  const nodes: NodeSeed[] = [
    { nodeType: 'ORGANIZATION', refId: org.id, label: org.legalName, meta: { city: org.city, country: org.countryCode } },
    ...customers.map((c) => ({
      nodeType: 'CUSTOMER',
      refId: c.id,
      label: c.name,
      meta: { segment: c.segment, city: c.city },
      risk: c.riskScore,
    })),
    ...suppliers.map((s) => ({ nodeType: 'SUPPLIER', refId: s.id, label: s.name, meta: { category: s.category } })),
    ...employees.map((e) => ({ nodeType: 'EMPLOYEE', refId: e.id, label: e.name, meta: { position: e.position } })),
    ...products.map((p) => ({ nodeType: 'PRODUCT', refId: p.id, label: p.name, meta: { price: p.unitPrice } })),
    ...accounts.map((a) => ({ nodeType: 'ACCOUNT', refId: a.id, label: a.name, meta: { provider: a.provider, balance: a.balance } })),
    ...invoices.map((i) => ({
      nodeType: 'INVOICE',
      refId: i.id,
      label: i.number,
      meta: { total: i.total, status: i.status, customer: i.customer.name },
    })),
    ...expenses.map((e) => ({ nodeType: 'EXPENSE', refId: e.id, label: e.reference, meta: { amount: e.amount, category: e.category } })),
    ...agents.map((a) => ({ nodeType: 'AGENT', refId: a.id, label: a.name, meta: { code: a.code, status: a.status } })),
  ]

  const created = await Promise.all(
    nodes.map((n) =>
      db.graphNode.create({
        data: {
          orgId,
          nodeType: n.nodeType,
          refId: n.refId,
          label: n.label,
          meta: JSON.stringify(n.meta),
          risk: n.risk,
        },
      })
    )
  )
  const by = (nodeType: string, refId: string) => created.find((n) => n.nodeType === nodeType && n.refId === refId)?.id
  const orgNode = by('ORGANIZATION', org.id)!

  type EdgeSeed = { sourceId: string; targetId: string; relation: string; weight?: number }
  const edges: EdgeSeed[] = []

  for (const e of employees) {
    const id = by('EMPLOYEE', e.id)
    if (id) edges.push({ sourceId: orgNode, targetId: id, relation: 'EMPLOYS' })
  }
  for (const a of accounts) {
    const id = by('ACCOUNT', a.id)
    if (id) edges.push({ sourceId: orgNode, targetId: id, relation: 'OWNS' })
  }
  for (const ag of agents) {
    const id = by('AGENT', ag.id)
    if (id) edges.push({ sourceId: orgNode, targetId: id, relation: 'OPERATED_BY' })
  }
  for (const c of customers) {
    const custNode = by('CUSTOMER', c.id)
    if (!custNode) continue
    const custInvoices = invoices.filter((i) => i.customerId === c.id)
    for (const i of custInvoices) {
      const invNode = by('INVOICE', i.id)
      if (!invNode) continue
      edges.push({ sourceId: invNode, targetId: custNode, relation: 'ISSUES_TO' })
      const pays = payments.filter((p) => p.invoiceId === i.id)
      for (const p of pays) {
        const payNode = by('PAYMENT', p.id)
        if (payNode) edges.push({ sourceId: payNode, targetId: invNode, relation: 'SETTLES', weight: p.amount })
      }
    }
  }
  for (const s of suppliers) {
    const supNode = by('SUPPLIER', s.id)
    if (!supNode) continue
    const supExpenses = expenses.filter((e) => e.supplierId === s.id)
    for (const e of supExpenses) {
      const expNode = by('EXPENSE', e.id)
      if (expNode) edges.push({ sourceId: supNode, targetId: expNode, relation: 'SUPPLIES' })
    }
  }
  for (const p of payments) {
    const payNode = by('PAYMENT', p.id)
    if (!payNode) continue
    const destAcc = p.destAccountId ? by('ACCOUNT', p.destAccountId) : null
    const srcAcc = p.sourceAccountId ? by('ACCOUNT', p.sourceAccountId) : null
    if (destAcc) edges.push({ sourceId: payNode, targetId: destAcc, relation: 'DEPOSITS_TO' })
    if (srcAcc) edges.push({ sourceId: payNode, targetId: srcAcc, relation: 'DEBITS_FROM' })
  }

  for (const e of edges) {
    const src = e.sourceId
    const tgt = e.targetId
    if (!src || !tgt) continue
    await db.graphEdge.create({
      data: { orgId, sourceId: src, targetId: tgt, relation: e.relation, weight: e.weight ?? 1 },
    })
  }

  return { nodes: created.length, edges: edges.length }
}

export async function getGraph(orgId: string) {
  const [nodes, edges] = await Promise.all([
    db.graphNode.findMany({ where: { orgId } }),
    db.graphEdge.findMany({ where: { orgId } }),
  ])
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.nodeType, refId: n.refId, label: n.label, risk: n.risk, meta: JSON.parse(n.meta || '{}') })),
    edges: edges.map((e) => ({ id: e.id, source: e.sourceId, target: e.targetId, relation: e.relation, weight: e.weight })),
  }
}
