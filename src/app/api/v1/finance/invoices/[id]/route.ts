import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { audit } from '@/lib/yahria/audit'
import { postEntry } from '@/lib/yahria/ledger'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const orgId = await getPrimaryOrgId()
  const invoice = await db.invoice.findUnique({ where: { id }, include: { lines: true, customer: true, payments: true } })
  if (!invoice || invoice.orgId !== orgId) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
  return NextResponse.json({ item: invoice })
}

// Invoice lifecycle actions: SEND | CANCEL | REMIND
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const orgId = await getPrimaryOrgId()
  const body = await req.json().catch(() => ({}))
  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice || invoice.orgId !== orgId) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

  if (body.action === 'SEND') {
    if (invoice.status !== 'DRAFT') return NextResponse.json({ error: 'Seule une facture brouillon peut être envoyée' }, { status: 409 })
    await postEntry({
      orgId, reference: `FAC/${invoice.number}`,
      description: `Facture ${invoice.number} — émission`,
      source: 'INVOICE', sourceId: invoice.id,
      lines: [
        { accountCode: '411', debit: invoice.total },
        { accountCode: '701', credit: invoice.subtotal },
        { accountCode: '4431', credit: invoice.vatAmount },
      ],
    })
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'SENT' } })
    await audit({ orgId, actorType: 'HUMAN', action: 'INVOICE_SENT', resourceType: 'INVOICE', resourceId: invoice.id, summary: `Facture ${invoice.number} émise — écritures comptables postées` })
    return NextResponse.json({ ok: true, status: 'SENT' })
  }

  if (body.action === 'CANCEL') {
    if (invoice.status === 'PAID') return NextResponse.json({ error: 'Une facture payée ne peut être annulée (INV-FIN-005)' }, { status: 409 })
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'CANCELLED' } })
    await audit({ orgId, actorType: 'HUMAN', action: 'INVOICE_CANCELLED', resourceType: 'INVOICE', resourceId: invoice.id, summary: `Facture ${invoice.number} annulée` })
    return NextResponse.json({ ok: true, status: 'CANCELLED' })
  }

  if (body.action === 'REMIND') {
    await db.invoice.update({
      where: { id: invoice.id },
      data: { notes: (invoice.notes ?? '') + ` | Relance enregistrée le ${new Date().toLocaleDateString('fr-FR')}` },
    })
    await audit({ orgId, actorType: 'HUMAN', action: 'INVOICE_REMINDER', resourceType: 'INVOICE', resourceId: invoice.id, summary: `Relance manuelle enregistrée pour ${invoice.number}` })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}
