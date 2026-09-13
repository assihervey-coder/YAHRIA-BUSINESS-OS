import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { audit } from '@/lib/yahria/audit'
import { postEntry } from '@/lib/yahria/ledger'
import { ref } from '@/lib/yahria/core'

export async function GET() {
  const orgId = await getPrimaryOrgId()
  const items = await db.expense.findMany({ where: { orgId }, orderBy: { expenseDate: 'desc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const orgId = await getPrimaryOrgId()
  const body = await req.json()
  const amount = Number(body.amount) || 0
  if (amount <= 0) return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
  const vatRate = typeof body.vatRate === 'number' ? body.vatRate : 0.18
  const vatAmount = Math.round(amount * vatRate)

  const expense = await db.expense.create({
    data: {
      orgId, reference: body.reference || ref('DEP'),
      category: body.category || 'OTHER',
      description: body.description || 'Dépense',
      amount, vatAmount,
      supplierId: body.supplierId || null,
      status: 'PENDING',
    },
  })

  await audit({
    orgId, actorType: 'HUMAN', action: 'EXPENSE_RECORDED',
    resourceType: 'EXPENSE', resourceId: expense.id,
    summary: `Dépense ${expense.reference} — ${expense.description} — ${amount.toLocaleString('fr-FR')} FCFA`,
  })

  return NextResponse.json({ item: expense }, { status: 201 })
}

// Approve + pay an expense (goes through the payment orchestration)
export async function PATCH(req: NextRequest) {
  const orgId = await getPrimaryOrgId()
  const body = await req.json()
  const expense = await db.expense.findUnique({ where: { id: body.id } })
  if (!expense || expense.orgId !== orgId) return NextResponse.json({ error: 'Dépense introuvable' }, { status: 404 })

  if (body.action === 'APPROVE') {
    await db.expense.update({ where: { id: expense.id }, data: { status: 'APPROVED' } })
    await audit({ orgId, actorType: 'HUMAN', action: 'EXPENSE_APPROVED', resourceType: 'EXPENSE', resourceId: expense.id, summary: `Dépense ${expense.reference} approuvée` })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'PAY') {
    if (expense.status === 'PAID') return NextResponse.json({ error: 'Dépense déjà payée' }, { status: 409 })
    const source = body.sourceAccountId ?? (await db.paymentAccount.findFirst({ where: { orgId, isDefault: true } }))?.id
    const total = expense.amount + expense.vatAmount
    // Post the charge entry immediately (charge recognized), payment settles 401
    const expAccount =
      expense.category === 'RENT' ? '622' : expense.category === 'TELECOM' ? '628' : expense.category === 'TRANSPORT' || expense.category === 'FUEL' ? '61' : expense.category === 'SALARIES' ? '64' : '601'
    await postEntry({
      orgId, reference: `DEP/${expense.reference}`,
      description: `Dépense ${expense.reference} — ${expense.description}`,
      source: 'EXPENSE', sourceId: expense.id,
      lines: [
        { accountCode: expAccount, debit: expense.amount },
        ...(expense.vatAmount > 0 ? [{ accountCode: '4452', debit: expense.vatAmount }] : []),
        { accountCode: '401', credit: total },
      ],
    })
    await db.expense.update({ where: { id: expense.id }, data: { status: 'PAID', paymentAccountId: source } })
    await audit({ orgId, actorType: 'HUMAN', action: 'EXPENSE_PAID', resourceType: 'EXPENSE', resourceId: expense.id, summary: `Dépense ${expense.reference} réglée — écriture charge + dette fournisseur postée` })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}
