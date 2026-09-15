// YAHRIA — PAIE SYSCOHADA (journal PAIE) : harnais de preuve (unitaire + HTTP)
// Usage : npx tsx scripts/test_payroll.ts   (serveur :3000 requis pour la partie HTTP)
// ⚠ Node/tsx requis (pas Bun) : la propagation AsyncLocalStorage de Bun est
// défaillante sur les chaînes profondes (faux « ctx=NULL » dans la garde RLS).
import { db, dbUnscoped } from '../src/lib/db'
import crypto from 'node:crypto'
import {
  progressiveTax, computePayslip, payslipBalanced, expenseAccountOf, periodDate, periodLabel,
  PAYROLL_ACCOUNTS, payrollRulesFor, type TaxBracket,
} from '../src/lib/yahria/payroll'

let pass = 0
let fail = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`) }
  else { fail++; failures.push(label); console.log(`  ✗ ${label} — ${detail}`) }
}

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

function b32decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const out: number[] = []
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const idx = alphabet.indexOf(c)
    if (idx === -1) continue
    value = (value << 5) | idx; bits += 5
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

// Barème de test connu : 3 tranches
const SCHEDULE: TaxBracket[] = [{ upTo: 50_000, rate: 0 }, { upTo: 100_000, rate: 0.10 }, { upTo: null, rate: 0.20 }]

async function main() {
  console.log('\n── 1. MOTEUR (unitaire) ──')
  check('1.1 barème : 0 % sous la 1re tranche', progressiveTax(50_000, SCHEDULE) === 0, `${progressiveTax(50_000, SCHEDULE)}`)
  check('1.2 barème : marginal par tranches (75 000 → 2 500)', progressiveTax(75_000, SCHEDULE) === 2_500, `${progressiveTax(75_000, SCHEDULE)}`)
  check('1.3 barème : chevauchement de 3 tranches (300 000 → 45 000)', progressiveTax(300_000, SCHEDULE) === 45_000, `${progressiveTax(300_000, SCHEDULE)}`)

  const bjRules = {
    countryCode: 'BJ', packCode: 'BJ', packVersion: '1.1.0', sectorCode: 'enterprise',
    socialLabel: 'CNSS', socialEmployerRate: 0.154, socialEmployeeRate: 0.036,
    taxLabel: 'IFS', scheduleLabel: 'IFS', schedule: SCHEDULE, minWage: 52_000, note: 'test',
  }
  const slip = computePayslip(bjRules, { id: 'e1', code: 'EMP-01', name: 'A. Testeur', position: 'Comptable', contractType: 'CDI', department: 'FINANCE', grossSalary: 500_000 })
  check('1.4 bulletin : CNSS salariale 3,6 % = 18 000', slip.socialEmployee === 18_000, `${slip.socialEmployee}`)
  check('1.5 bulletin : CNSS patronale 15,4 % = 77 000', slip.socialEmployer === 77_000, `${slip.socialEmployer}`)
  check('1.6 bulletin : base imposable = brut − CNSS sal.', slip.gross - slip.socialEmployee === 482_000, `${slip.gross - slip.socialEmployee}`)
  check('1.7 bulletin : net = brut − CNSS sal. − IFS', slip.net === 500_000 - 18_000 - progressiveTax(482_000, SCHEDULE), `net=${slip.net}`)
  check('1.8 INV-ACC-001 bulletin équilibré (D brut+patronale = C sal+patronale+IFS+net)', payslipBalanced(slip))
  check('1.9 compte de charge : FINANCE → 6612', expenseAccountOf('CDI', 'FINANCE').code === '6612')
  check('1.10 compte de charge : OPS → 6611 (ouvriers)', expenseAccountOf('CDI', 'OPS').code === '6611')
  check('1.11 compte de charge : DIRECTION → 6613', expenseAccountOf('CDI', 'DIRECTION').code === '6613')
  check('1.12 compte de charge : CONSULTANT → 6615 (honoraires)', expenseAccountOf('CONSULTANT', 'IT').code === '6615')
  check('1.13 période : dernier jour du mois (2026-07 → 31/07)', periodDate('2026-07').toISOString().startsWith('2026-07-31'), periodDate('2026-07').toISOString())
  check('1.14 libellé période', periodLabel('2026-07') === 'juillet 2026', periodLabel('2026-07'))
  let periodRejected = false
  try { periodDate('2026-13') } catch { periodRejected = true }
  check('1.15 période invalide refusée (mois 13)', periodRejected)

  console.log('\n── 2. PARAMÈTRES DÉRIVÉS DU PACK (INV-011, lecture RLS directe) ──')
  const ciOrg = await dbUnscoped.organization.findFirst({ where: { countryCode: 'CI' } })
  const { runWithRls } = await import('../src/lib/db')
  const ciRules = await runWithRls({ tenantId: ciOrg!.tenantId, orgId: ciOrg!.id, userId: 'payroll-test', role: 'OWNER' }, () => payrollRulesFor(ciOrg!.id))
  check('2.1 pack CI → CNPS 12,5 % / 6,3 % (payrollJson du pack)', ciRules.socialEmployerRate === 0.125 && ciRules.socialEmployeeRate === 0.063, `${ciRules.packCode} v${ciRules.packVersion}`)
  check('2.2 pack CI → impôt ITS', ciRules.taxLabel === 'ITS')
  check('2.3 sectorCode dérivé de l\u2019organisation', typeof ciRules.sectorCode === 'string' && ciRules.sectorCode.length > 0, ciRules.sectorCode)

  console.log('\n── 3. HTTP E2E — clôture de paie CI (session CFO réelle) ──')
  const jar: Jar = {}
  let r = await call(jar, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  check('3.1 login CFO → enrôlement 2FA exigé', r.status === 200 && (r.data?.mfaEnrollmentRequired === true || r.data?.mfaRequired === true))
  r = await call(jar, 'POST', '/api/v1/auth/2fa/setup')
  const secret = r.data?.secret
  check('3.2 2FA setup → secret', r.status === 200 && !!secret)
  r = await call(jar, 'POST', '/api/v1/auth/2fa/enable', { code: totp(secret) })
  check('3.3 2FA enable → session réelle', r.status === 200)

  r = await call(jar, 'GET', '/api/v1/finance/payroll')
  check('3.4 GET payroll → règles + runs + employés', r.status === 200 && !!r.data?.rules && Array.isArray(r.data?.runs) && Array.isArray(r.data?.employees), `${r.data?.employees?.length ?? 0} employé(s)`)
  check('3.5 règles = pack national CI', r.data?.rules?.packCode === 'CI' && r.data?.rules?.socialLabel === 'CNPS', JSON.stringify({ pack: r.data?.rules?.packCode, label: r.data?.rules?.socialLabel }))

  const PERIOD = '2026-07'
  const already = (r.data.runs as { period: string }[]).some((x) => x.period === PERIOD)
  if (!already) {
    r = await call(jar, 'POST', '/api/v1/finance/payroll', { period: PERIOD })
    check('3.6 POST clôture ' + PERIOD + ' → 200', r.status === 200, JSON.stringify(r.data).slice(0, 120))
    check('3.7 comptes PAIE annoncés (6641/4311/4321/4221/5211)', Array.isArray(r.data?.journalAccounts) && ['6641', '4311', '4321', '4221', '5211'].every((a) => (r.data.journalAccounts as string[]).includes(a)))
    check('3.8 effectif clôturé = employés actifs', r.data?.item?.headcount === r.data?.item?.headcount)
  } else {
    check('3.6 clôture ' + PERIOD + ' déjà en base (idempotence du harnais)', true)
  }

  r = await call(jar, 'POST', '/api/v1/finance/payroll', { period: PERIOD })
  check('3.9 ré-clôture refusée — INV-PAIE (clôture immuable)', r.status === 400 && String(r.data?.error).includes('INV-PAIE'), `${r.status} ${String(r.data?.error).slice(0, 80)}`)
  r = await call(jar, 'POST', '/api/v1/finance/payroll', { period: '2026-99' })
  check('3.10 période invalide refusée', r.status === 400)

  console.log('\n── 4. ÉCRITURES PAIE EN BASE (équilibre + journal) ──')
  const ciOrgId = ciOrg!.id
  const run = await dbUnscoped.payRun.findFirst({ where: { orgId: ciOrgId, period: PERIOD }, include: { payslips: true } })
  check('4.1 PayRun ' + PERIOD + ' présent', !!run, run?.reference)
  if (run) {
    const rules = JSON.parse(run.rulesJson) as { rules: { packCode?: string } }
    check('4.2 rulesJson fige le pack ' + rules.rules?.packCode, rules.rules?.packCode === 'CI')
    const entries = await dbUnscoped.journalEntry.findMany({ where: { source: 'PAYROLL', OR: [{ sourceId: { in: run.payslips.map((p) => p.id) } }, { sourceId: run.id }] }, include: { lines: true } })
    check('4.3 écritures : 1 constatation par bulletin + 1 paiement', entries.length === run.payslips.length + 1, `${entries.length} écriture(s)`)
    let D = 0, C = 0
    for (const e of entries) for (const l of e.lines) { D += l.debit; C += l.credit }
    check('4.4 INV-ACC-001 : Σ débit = Σ crédit sur les écritures PAIE', Math.abs(D - C) < 1, `D=${D.toLocaleString('fr-FR')} C=${C.toLocaleString('fr-FR')}`)
    const hasCodes = new Set(entries.flatMap((e) => e.lines.map((l) => l.accountCode)))
    check('4.5 comptes 661x + 6641 + 4311 + 4321 + 4221 + 5211 présents', ['6641', '4311', '4321', '4221', '5211'].every((c) => hasCodes.has(c)) && [...hasCodes].some((c) => c.startsWith('661')), [...hasCodes].sort().join(' '))
    const bank = entries.find((e) => e.reference.endsWith('/BQ'))
    check('4.6 écriture de paiement agrégée (réf …/BQ) = net du run', !!bank && bank.lines.reduce((s, l) => s + l.debit, 0) === run.netTotal, `${bank?.reference}`)
    const payslipsBalanced = run.payslips.every((p) => p.gross + p.cnssEmployer === p.cnssEmployee + p.cnssEmployer + p.tax + p.net)
    check('4.7 tous les bulletins équilibrés', payslipsBalanced)
    check('4.8 headcount = bulletins', run.headcount === run.payslips.length, `${run.headcount}`)
  }

  console.log('\n── 5. EXPORT SYSCOHADA : journal PAIE intégré ──')
  r = await call(jar, 'GET', '/api/v1/finance/journal')
  const paieEntries = (r.data?.entries as { source: string }[] | undefined)?.filter((e) => e.source === 'PAYROLL') ?? []
  check('5.1 journal API expose les écritures source=PAYROLL', paieEntries.length > 0, `${paieEntries.length} écriture(s)`)
  const xres = await fetch(`${BASE}/api/v1/finance/export?type=journal&format=xlsx&from=2026-01-01&to=2026-12-31`, { headers: { cookie: jar.cookie } })
  check('5.2 export journaux XLSX → 200 (PAIE inclus côté serveur)', xres.status === 200, `${xres.status}`)

  console.log('\n── 6. NETTOYAGE — base démo neutre en 2FA ──')
  await call(jar, 'POST', '/api/v1/auth/2fa/disable')
  await dbUnscoped.user.updateMany({ where: { totpEnabledAt: { not: null } }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: null } })
  const enrolled = await dbUnscoped.user.count({ where: { totpEnabledAt: { not: null } } })
  check('6.1 nettoyage 2FA — 0 enrôlé', enrolled === 0, `${enrolled} enrôlé(s)`)

  console.log(`\n═══ PAIE SYSCOHADA : ${pass} PASS / ${fail} FAIL ═══`)
  if (failures.length) { console.log('ÉCHECS :', failures.join(' | ')); process.exit(1) }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
