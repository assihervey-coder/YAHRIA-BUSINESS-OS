import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { audit } from '@/lib/yahria/audit'
import { postEntry } from '@/lib/yahria/ledger'
import { ref } from '@/lib/yahria/core'

export async function GET() {
  const orgId = await getPrimaryOrgId()
  const invoices = await db.invoice.findMany({ where: { orgId }, orderBy: { issueDate: 'desc' }, include: { customer: { select: { name: true, segment: true } }, lines: true } })
  return NextResponse.json({ items: invoices })
}

export async function POST(req: NextRequest) {
  const orgId = await getPrimaryOrgId()
  const body = await req.json()

  const customer = await db.customer.findUnique({ where: { id: body.customerId } })
  if (!customer) return NextResponse.json({ error: 'Client introuvable' }, { status: 400 })
  const linesIn: { description: string; quantity: number; unitPrice: number; vatRate?: number }[] = body.lines ?? []
  if (!linesIn.length) return NextResponse.json({ error: 'Au moins une ligne est requise' }, { status: 400 })

  const vatDefault = 0.18
  const linesData = linesIn.map((l) => {
    const qty = Number(l.quantity) || 0
    const price = Number(l.unitPrice) || 0
    const vatRate = typeof l.vatRate === 'number' ? l.vatRate : vatDefault
    return { description: l.description, quantity: qty, unitPrice: price, vatRate, lineTotal: Math.round(qty * price * (1 + vatRate)) }
  })
  const subtotal = Math.round(linesData.reduce((s, l) => s + l.quantity * l.unitPrice, 0))
  const vatAmount = Math.round(linesData.reduce((s, l) => s + l.quantity * l.unitPrice * l.vatRate, 0))
  const total = subtotal + vatAmount
  const dueDays = Number(body.dueDays) || 30

  const count = await db.invoice.count({ where: { orgId } })
  const number = `FAC-2026-${String(count + 1).padStart(3, '0')}`

  const invoice = await db.invoice.create({
    data: {
      orgId, number, customerId: body.customerId,
      status: body.status === 'SENT' ? 'SENT' : 'DRAFT',
      dueDate: new Date(Date.now() + dueDays * 86400000),
      subtotal, vatAmount, total,
      notes: body.notes ?? null,
      lines: { create: linesData },
    },
    include: { lines: true },
  })

  // Accounting only when issued (draft = no posting)
  if (invoice.status === 'SENT') {
    const svcShare = linesData.some((l) => /service|prestation|livraison|logistique/i.test(l.description))
    const revAccount = svcShare ? '706' : '701'
    await postEntry({
      orgId, reference: `FAC/${number}`,
      description: `Facture ${number} — ${customer.name}`,
      source: 'INVOICE', sourceId: invoice.id,
      lines: [
        { accountCode: '411', debit: total },
        { accountCode: revAccount, credit: subtotal },
        { accountCode: '4431', credit: vatAmount },
      ],
    })
  }

  await audit({
    orgId, actorType: 'HUMAN', action: 'INVOICE_CREATED',
    resourceType: 'INVOICE', resourceId: invoice.id,
    summary: `Facture ${number} — ${customer.name} — ${total.toLocaleString('fr-FR')} FCFA (${invoice.status})`,
  })

  return NextResponse.json({ item: invoice }, { status: 201 })
}
