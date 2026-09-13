import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { audit } from '@/lib/yahria/audit'
import { ref } from '@/lib/yahria/core'

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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params
  const model = modelFor(entity)
  if (!model) return NextResponse.json({ error: 'Entité inconnue' }, { status: 404 })
  void 0
  const orgId = await getPrimaryOrgId()
  const rows = await (model as Record<string, { findMany: (args: unknown) => Promise<unknown[]> }>).findMany({ where: { orgId }, orderBy: { id: 'asc' } })
  return NextResponse.json({ items: rows })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params
  const model = modelFor(entity)
  if (!model) return NextResponse.json({ error: 'Entité inconnue' }, { status: 404 })
  void model
  const orgId = await getPrimaryOrgId()
  const body = await req.json()

  let created
  if (entity === 'customers') {
    created = await db.customer.create({
      data: {
        orgId, code: body.code || ref('CLI'), name: body.name, segment: body.segment || 'SME',
        email: body.email || null, phone: body.phone || null, city: body.city || null,
        countryCode: body.countryCode || 'CI', riskScore: typeof body.riskScore === 'number' ? body.riskScore : 25,
      },
    })
  } else if (entity === 'suppliers') {
    created = await db.supplier.create({
      data: {
        orgId, code: body.code || ref('FRN'), name: body.name, category: body.category || 'SUPPLIES',
        email: body.email || null, phone: body.phone || null, city: body.city || null, performance: body.performance || 80,
      },
    })
  } else if (entity === 'employees') {
    created = await db.employee.create({
      data: {
        orgId, code: body.code || ref('EMP'), name: body.name, position: body.position || 'Employé',
        department: body.department || 'OPS', contractType: body.contractType || 'CDI',
        grossSalary: Number(body.grossSalary) || 0, hiredAt: new Date(),
      },
    })
  } else {
    created = await db.product.create({
      data: {
        orgId, code: body.code || ref('PRD'), name: body.name, type: body.type || 'PRODUCT',
        unit: body.unit || 'unité', unitPrice: Number(body.unitPrice) || 0,
        vatRate: typeof body.vatRate === 'number' ? body.vatRate : 0.18,
        stock: body.type === 'PRODUCT' && body.stock != null ? Number(body.stock) : null,
        description: body.description || null,
      },
    })
  }

  await audit({
    orgId, actorType: 'HUMAN', action: 'CORE_ENTITY_CREATED',
    resourceType: entity.toUpperCase(), resourceId: created.id,
    summary: `${entity}: ${'name' in created ? created.name : created.code} créé(e)`,
  })

  return NextResponse.json({ item: created }, { status: 201 })
}
