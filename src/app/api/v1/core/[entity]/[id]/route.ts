import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { audit } from '@/lib/yahria/audit'

type Entity = 'customers' | 'suppliers' | 'employees' | 'products'

function modelFor(entity: string) {
  switch (entity) {
    case 'customers': return db.customer
    case 'suppliers': return db.supplier
    case 'employees': return db.employee
    case 'products': return db.product
    default: return null
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await ctx.params
  const model = modelFor(entity)
  if (!model) return NextResponse.json({ error: 'Entité inconnue' }, { status: 404 })
  const orgId = await getPrimaryOrgId()

  // Business guard: a customer with open invoices cannot be archived hard
  if (entity === 'customers') {
    const open = await db.invoice.count({ where: { customerId: id, status: { in: ['SENT', 'OVERDUE', 'PARTIAL'] } } })
    if (open > 0) {
      return NextResponse.json({ error: `Client lié à ${open} facture(s) en cours — archivage impossible (intégrité référentielle)` }, { status: 409 })
    }
    await db.customer.update({ where: { id }, data: { status: 'ARCHIVED' } })
  } else {
    await (model as any).update({ where: { id }, data: { status: 'ARCHIVED' } })
  }

  await audit({
    orgId, actorType: 'HUMAN', action: 'CORE_ENTITY_ARCHIVED',
    resourceType: entity.toUpperCase(), resourceId: id,
    summary: `${entity}: ${id} archivé(e) — suppression physique interdite (INV-DB-003)`,
  })
  return NextResponse.json({ ok: true })
}
