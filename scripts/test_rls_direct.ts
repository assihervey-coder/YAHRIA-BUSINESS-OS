// Test direct du RLS applicatif (hors Next) — bun scripts/test_rls_direct.ts
import { db, dbUnscoped, runWithRls } from '../src/lib/db'

async function main() {
  const bjOrg = await dbUnscoped.organization.findFirst({ where: { countryCode: 'BJ' } })
  const ciAcc = await dbUnscoped.paymentAccount.findFirst({ where: { org: { countryCode: 'CI' } } })
  console.log('org BJ:', bjOrg?.legalName, '| compte CI:', ciAcc?.name, ciAcc?.id)

  // 1. findUnique d'un compte CI depuis un contexte BJ → RLS_VIOLATION attendu
  try {
    await runWithRls({ tenantId: bjOrg!.tenantId, orgId: bjOrg!.id, userId: 'test', role: 'OWNER' }, async () => {
      const row = await db.paymentAccount.findUnique({ where: { id: ciAcc!.id } })
      console.log('1. findUnique compte CI → PAS D\'EXCEPTION, row =', row?.name, '❌ RLS BYPASSÉE')
    })
  } catch (e) {
    console.log('1. findUnique compte CI →', (e as Error).message.slice(0, 80), '✓')
  }

  // 2. findMany depuis contexte BJ → ne doit retourner QUE les comptes BJ
  await runWithRls({ tenantId: bjOrg!.tenantId, orgId: bjOrg!.id, userId: 'test', role: 'OWNER' }, async () => {
    const rows = await db.paymentAccount.findMany()
    console.log('2. findMany sans filtre depuis BJ →', rows.length, 'comptes :', rows.map((r) => r.provider).join(','), rows.every((r) => r.orgId === bjOrg!.id) ? '✓' : '❌ FUITE')
  })

  // 3. create sans orgId → forcé à BJ
  await runWithRls({ tenantId: bjOrg!.tenantId, orgId: bjOrg!.id, userId: 'test', role: 'OWNER' }, async () => {
    const created = await db.auditRecord.create({
      data: { traceId: 'trc_rls_test', actorType: 'SYSTEM', actorId: 't', actorName: 'Test RLS', action: 'RLS_TEST', resourceType: 'TEST', summary: 'test' },
    })
    console.log('3. create audit sans orgId → orgId forcé =', created.orgId === bjOrg!.id ? bjOrg!.id.slice(0, 6) + ' ✓' : created.orgId + ' ❌')
    await dbUnscoped.auditRecord.delete({ where: { id: created.id } })
  })
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
