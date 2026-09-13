import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'
import { jparse } from '@/lib/yahria/core'

export async function GET() {
  const orgId = await getPrimaryOrgId()
  const [org, tenant, packs, sectors] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.tenant.findFirst(),
    db.countryPack.findMany({ orderBy: { code: 'asc' } }),
    db.sectorEngine.findMany({ orderBy: { code: 'asc' } }),
  ])
  return NextResponse.json({
    org: org && {
      id: org.id, name: org.name, legalName: org.legalName, city: org.city, countryCode: org.countryCode,
      currencyCode: org.currencyCode, sectorCode: org.sectorCode, taxId: org.taxId, rccm: org.rccm,
    },
    tenant: tenant && { name: tenant.name, plan: tenant.plan },
    countryPacks: packs.map((p) => ({
      ...p,
      mobileMoney: jparse(p.mobileMoneyJson, []),
      banks: jparse(p.banksJson, []),
      payroll: jparse(p.payrollJson, {}),
      compliance: jparse(p.complianceJson, {}),
      invoicing: jparse(p.invoicingJson, {}),
    })),
    sectorEngines: sectors.map((s) => ({
      ...s,
      entities: jparse<string[]>(s.entitiesJson, []),
      kpis: jparse<string[]>(s.kpisJson, []),
      workflows: jparse<string[]>(s.workflowsJson, []),
    })),
  })
}
