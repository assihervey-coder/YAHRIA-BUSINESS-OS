import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/yahria/auth'
import { jparse } from '@/lib/yahria/core'

export async function GET(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const orgId = s.orgId
    const [org, packs, sectors] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId } }),
      db.countryPack.findMany({ orderBy: { code: 'asc' } }),
      db.sectorEngine.findMany({ orderBy: { code: 'asc' } }),
    ])
    return {
      org: org && {
        id: org.id, name: org.name, legalName: org.legalName, city: org.city, countryCode: org.countryCode,
        currencyCode: org.currencyCode, sectorCode: org.sectorCode, taxId: org.taxId, rccm: org.rccm,
      },
      tenant: { name: s.tenant.name, plan: s.tenant.plan },
      user: { name: s.name, email: s.email, role: s.role, permissions: s.permissions },
      countryPacks: packs.map((p) => ({
        ...p,
        mobileMoney: jparse(p.mobileMoneyJson, []),
        banks: jparse(p.banksJson, []),
        payroll: jparse(p.payrollJson, {}),
        compliance: jparse(p.complianceJson, {}),
        invoicing: jparse(p.invoicingJson, {}),
      })),
      sectorEngines: sectors.map((sec) => ({
        ...sec,
        entities: jparse<string[]>(sec.entitiesJson, []),
        kpis: jparse<string[]>(sec.kpisJson, []),
        workflows: jparse<string[]>(sec.workflowsJson, []),
      })),
    }
  })
}
