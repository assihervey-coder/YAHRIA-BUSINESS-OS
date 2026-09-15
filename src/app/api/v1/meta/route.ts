import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/yahria/auth'
import { jparse } from '@/lib/yahria/core'
import { registryIntegrity, getSector, negotiateContract } from '@/lib/yahria/sectors/registry'
import { SECTOR_CONTRACT_VERSIONS, SUPPORTED_CONTRACT_VERSIONS } from '@/lib/yahria/sectors/contract'
import { PACK_MANIFEST_SPEC, API_CONTRACT, PAYROLL_CONTRACT } from '@/lib/yahria/contracts'

export async function GET(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const orgId = s.orgId
    const [org, packs, sectors] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId } }),
      db.countryPack.findMany({ orderBy: { code: 'asc' } }),
      db.sectorEngine.findMany({ orderBy: { code: 'asc' } }),
    ])
    const reg = registryIntegrity()
    return {
      contract: { apiVersion: API_CONTRACT.version, packManifest: PACK_MANIFEST_SPEC.version, sectorContract: reg.contractVersion, payrollContract: PAYROLL_CONTRACT.version },
      sectorContract: {
        version: reg.contractVersion,
        supportedVersions: SUPPORTED_CONTRACT_VERSIONS,
        releases: Object.values(SECTOR_CONTRACT_VERSIONS),
        negotiation: negotiateContract(reg.contractVersion),
        registry: reg,
      },
      payrollContract: PAYROLL_CONTRACT,
      org: org && {
        id: org.id, name: org.name, legalName: org.legalName, city: org.city, countryCode: org.countryCode,
        currencyCode: org.currencyCode, sectorCode: org.sectorCode, taxId: org.taxId, rccm: org.rccm,
      },
      tenant: { name: s.tenant.name, plan: s.tenant.plan },
      user: { name: s.name, email: s.email, role: s.role, permissions: s.permissions },
      countryPacks: packs.map((p) => ({
        ...p,
        manifestSchema: PACK_MANIFEST_SPEC.version, // INV-013 : schéma de manifest versionné
        mobileMoney: jparse(p.mobileMoneyJson, []),
        banks: jparse(p.banksJson, []),
        payroll: jparse(p.payrollJson, {}),
        compliance: jparse(p.complianceJson, {}),
        invoicing: jparse(p.invoicingJson, {}),
      })),
      sectorEngines: sectors.map((sec) => {
        const ext = getSector(sec.code)
        return {
          ...sec,
          entities: jparse<string[]>(sec.entitiesJson, []),
          kpis: jparse<string[]>(sec.kpisJson, []),
          workflows: jparse<string[]>(sec.workflowsJson, []),
          // INV-012 : l'engine est chargé via le registre (jamais importé directement)
          registry: { registered: !!ext, extensionVersion: ext?.version ?? null, contractVersion: ext?.contractVersion ?? null },
        }
      }),
      sectorRegistry: { total: reg.total, contractVersion: reg.contractVersion, versionsOk: reg.versionsOk, byContractVersion: reg.byContractVersion, refused: reg.refused, hooksCoverage: reg.hooksCoverage },
    }
  })
}
