// YAHRIA — RLS APPROFONDIE : harnais de preuve (unitaire + HTTP)
// 26 checks. Usage : npx tsx scripts/test_rls_deep.ts   (serveur :3000 requis pour la partie HTTP)
import { db, dbUnscoped, runWithRls } from '../src/lib/db'
import crypto from 'node:crypto'

let pass = 0
let fail = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`) }
  else { fail++; failures.push(label); console.log(`  ✗ ${label} — ${detail}`) }
}

// TOTP (compat serveur : SHA-1, 30 s, 6 chiffres, base32)
function b32decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const idx = alphabet.indexOf(c)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return Buffer.from(out)
}
function totp(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter % 2 ** 32, 4)
  const hmac = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest()
  const off = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

async function refuses(label: string, attack: () => Promise<unknown>) {
  try {
    await attack()
    check(label, false, 'attaque ABOUTIE — invariant rompu')
  } catch (e) {
    const msg = (e as Error).message ?? ''
    check(label, msg.includes('RLS_VIOLATION'), msg.slice(0, 100))
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
interface Jar { cookie?: string }
const BASE = 'http://localhost:3000'
async function call(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(jar.cookie ? { cookie: jar.cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie?.includes('yahria_session=')) jar.cookie = setCookie.split(';')[0]
  let data: any = null
  try { data = await res.json() } catch { /* binaire */ }
  return { status: res.status, data }
}

async function main() {
  const ciOrg = await dbUnscoped.organization.findFirst({ where: { countryCode: 'CI' } })
  const bjOrg = await dbUnscoped.organization.findFirst({ where: { countryCode: 'BJ' } })
  const ctx = { tenantId: ciOrg!.tenantId, orgId: ciOrg!.id, userId: 'rls-deep', role: 'OWNER' }

  console.log('\n── 1. LECTURES HORS PÉRIMÈTRE (unitaire) ──')
  const bjAccount = await dbUnscoped.paymentAccount.findFirst({ where: { orgId: bjOrg!.id } })
  const bjCustomer = await dbUnscoped.customer.findFirst({ where: { orgId: bjOrg!.id } })
  const bjInvoice = await dbUnscoped.invoice.findFirst({ where: { orgId: bjOrg!.id } })
  await refuses('1.1 findUnique compte BJ depuis CI', () => runWithRls(ctx, () => db.paymentAccount.findUnique({ where: { id: bjAccount!.id } })))
  await refuses('1.2 findUniqueOrThrow client BJ depuis CI', () => runWithRls(ctx, () => db.customer.findUniqueOrThrow({ where: { id: bjCustomer!.id } })))
  await refuses('1.3 findFirstOrThrow facture BJ depuis CI', () => runWithRls(ctx, () => db.invoice.findFirstOrThrow({ where: { id: bjInvoice!.id } })))
  await refuses('1.4 organization.findUnique (BJ par id) depuis CI', () => runWithRls(ctx, () => db.organization.findUnique({ where: { id: bjOrg!.id } })))
  const ownOrgs = await runWithRls(ctx, () => db.organization.findMany())
  check('1.5 findMany organization scoppé = org courante uniquement', ownOrgs.length === 1 && ownOrgs[0].id === ciOrg!.id, `${ownOrgs.length} ligne(s)`)
  // Portée ENFANT : les lignes de grand livre héritent du périmètre via entryId
  const ciLinesExpected = await dbUnscoped.ledgerLine.count({ where: { entry: { orgId: ciOrg!.id } } })
  const ciLinesScoped = await runWithRls(ctx, () => db.ledgerLine.count())
  check('1.6 findMany ledgerLine (enfant) scoppé via entry', ciLinesScoped === ciLinesExpected, `${ciLinesScoped}/${ciLinesExpected} lignes CI`)

  console.log('\n── 2. MUTATIONS HORS PÉRIMÈTRE (unitaire) ──')
  await refuses('2.1 update client BJ depuis CI', () => runWithRls(ctx, () => db.customer.update({ where: { id: bjCustomer!.id }, data: { name: 'DÉTOURNÉ' } })))
  const bjProduct = await dbUnscoped.product.findFirst({ where: { orgId: bjOrg!.id } })
  await refuses('2.2 delete produit BJ depuis CI', () => runWithRls(ctx, () => db.product.delete({ where: { id: bjProduct!.id } })))
  await refuses('2.3 upsert facture BJ depuis CI', () => runWithRls(ctx, () => db.invoice.upsert({ where: { id: bjInvoice!.id }, create: { number: `RLSDEEP-${Date.now()}`, customerId: bjCustomer!.id, dueDate: new Date('2030-01-01') }, update: { status: 'PAID' } })))
  const updMany = await runWithRls(ctx, () => db.invoice.updateMany({ where: { orgId: bjOrg!.id }, data: { status: 'CANCELLED' } }))
  check('2.4 updateMany factures BJ depuis CI → 0 ligne atteinte (filtrage)', updMany.count === 0, `${updMany.count} ligne(s) "mutée(s)"`)
  const afterMany = await dbUnscoped.invoice.count({ where: { orgId: bjOrg!.id, status: 'CANCELLED' } })
  check('2.5 aucune facture BJ réellement annulée', afterMany === 0, `${afterMany} facture(s) BJ annulée(s)`)

  console.log('\n── 3. GARDE ANTI-FK ÉTRANGÈRE (unitaire) ──')
  const ciCustomer = await dbUnscoped.customer.findFirst({ where: { orgId: ciOrg!.id } })
  await refuses('3.1 create facture CI avec customerId BJ', () => runWithRls(ctx, () => db.invoice.create({ data: { number: `RLSDEEP-FK-${Date.now()}`, customerId: bjCustomer!.id, dueDate: new Date('2030-01-01') } })))
  const bjPayment = await dbUnscoped.paymentAccount.findFirst({ where: { orgId: bjOrg!.id } })
  await refuses('3.2 create dépense CI avec paymentAccountId BJ', () => runWithRls(ctx, () => db.expense.create({ data: { amount: 1000, description: 'FK attack', paymentAccountId: bjPayment!.id } })))
  const ciInvoice = await dbUnscoped.invoice.findFirst({ where: { orgId: ciOrg!.id } })
  if (ciInvoice) {
    await refuses('3.3 update facture CI → rebrancher customerId BJ', () => runWithRls(ctx, () => db.invoice.update({ where: { id: ciInvoice.id }, data: { customerId: bjCustomer!.id } })))
  }
  await refuses('3.4 ledgerline.create avec entryId BJ', () => runWithRls(ctx, async () => {
    const bjEntry = await dbUnscoped.journalEntry.findFirst({ where: { orgId: bjOrg!.id } })
    return db.ledgerLine.create({ data: { entryId: bjEntry!.id, accountCode: '999', accountName: 'probe', debit: 1, credit: 0 } })
  }))
  // Contrôle positif : FK nationale acceptée, orgId forcé
  const okInvoice = await runWithRls(ctx, () => db.invoice.create({ data: { number: `RLSDEEP-OK-${Date.now()}`, customerId: ciCustomer!.id, dueDate: new Date('2030-01-01') } }))
  check('3.5 create facture CI avec customer CI → OK, orgId forcé', okInvoice.orgId === ciOrg!.id)
  await dbUnscoped.invoice.delete({ where: { id: okInvoice.id } })
  check('3.6 nettoyage facture de contrôle', (await dbUnscoped.invoice.count({ where: { id: okInvoice.id } })) === 0)

  console.log('\n── 4. createMany : orgId forgé écrasé ──')
  const suffix = String(Date.now())
  const forged = await runWithRls(ctx, () => db.customer.createMany({
    data: [
      { orgId: bjOrg!.id, code: `RLSDEEP-CM1-${suffix}`, name: 'forged BJ org', segment: 'RETAIL' },
      { orgId: 'FORGED-ORG-000', code: `RLSDEEP-CM2-${suffix}`, name: 'forged unknown org', segment: 'RETAIL' },
    ],
  }))
  check('4.1 createMany accepté (2 lignes)', forged.count === 2)
  const forgedRows = await dbUnscoped.customer.findMany({ where: { code: { in: [`RLSDEEP-CM1-${suffix}`, `RLSDEEP-CM2-${suffix}`] } } })
  check('4.2 orgId forgé ÉCRASÉ par le périmètre', forgedRows.length === 2 && forgedRows.every((r) => r.orgId === ciOrg!.id), forgedRows.map((r) => r.orgId.slice(0, 6)).join(','))
  await dbUnscoped.customer.deleteMany({ where: { code: { in: [`RLSDEEP-CM1-${suffix}`, `RLSDEEP-CM2-${suffix}`] } } })
  check('4.3 nettoyage lignes de contrôle', (await dbUnscoped.customer.count({ where: { code: { in: [`RLSDEEP-CM1-${suffix}`, `RLSDEEP-CM2-${suffix}`] } } })) === 0)

  console.log('\n── 5. HTTP (session CFO CI réelle) ──')
  const jar: Jar = {}
  let r = await call(jar, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  check('5.1 login CFO → 200 + enrôlement exigé', r.status === 200 && (r.data?.mfaEnrollmentRequired === true || r.data?.mfaRequired === true), JSON.stringify(r.data).slice(0, 80))
  r = await call(jar, 'POST', '/api/v1/auth/2fa/setup')
  const secret = r.data?.secret
  check('5.2 2FA setup → secret', r.status === 200 && !!secret)
  r = await call(jar, 'POST', '/api/v1/auth/2fa/enable', { code: totp(secret) })
  check('5.3 2FA enable → session réelle', r.status === 200 && r.data?.ok !== false, JSON.stringify(r.data).slice(0, 60))
  const bjSupplier = await dbUnscoped.supplier.findFirst({ where: { orgId: bjOrg!.id } })
  r = await call(jar, 'POST', '/api/v1/finance/expenses', { amount: 5000, description: 'FK HTTP attack', supplierId: bjSupplier!.id })
  check('5.4 POST dépense avec fournisseur BJ → 403 RLS_VIOLATION', r.status === 403 && String(r.data?.error ?? '').includes('RLS_VIOLATION'), `${r.status} ${String(r.data?.error).slice(0, 60)}`)
  r = await call(jar, 'POST', '/api/v1/finance/expenses', { amount: 5000, description: 'orgId forgé HTTP', reference: 'RLS-DEEP-HTTP' })
  check('5.5 POST dépense légitime → 201', r.status === 201, `${r.status}`)
  if (r.data?.item?.id) {
    const row = await dbUnscoped.expense.findUnique({ where: { id: r.data.item.id } })
    check('5.6 orgId du corps ignoré — ligne rattachée à CI', row?.orgId === ciOrg!.id, row?.orgId.slice(0, 6))
    await dbUnscoped.expense.delete({ where: { id: row!.id } })
  }
  r = await call(jar, 'GET', `/api/v1/finance/export?type=balance&format=xlsx&from=2026-01-01&to=2026-12-31`)
  check('5.7 export balance CI (contrôle) → 200 XLSX', r.status === 200, `${r.status}`)

  // Nettoyage 2FA CFO + résidu hors baseline (base démo neutre : 0 enrôlé)
  await call(jar, 'POST', '/api/v1/auth/2fa/disable')
  await dbUnscoped.user.updateMany({ where: { totpEnabledAt: { not: null } }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: null } })
  const enrolled = await dbUnscoped.user.count({ where: { totpEnabledAt: { not: null } } })
  check('5.8 nettoyage 2FA — base démo neutre (0 enrôlé)', enrolled === 0, `${enrolled} enrôlé(s)`)

  console.log(`\n═══ RLS APPROFONDIE : ${pass} PASS / ${fail} FAIL ═══`)
  if (failures.length) { console.log('ÉCHECS :', failures.join(' | ')); process.exit(1) }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
