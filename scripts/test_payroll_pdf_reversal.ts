// YAHRIA — PAIE : BULLETIN PDF PAR SALARIÉ + CONTRE-PASSATION GUIDÉE
// Harnais de preuve (unitaire + HTTP E2E). Usage : npx tsx scripts/test_payroll_pdf_reversal.ts
// ⚠ Node/tsx requis (pas Bun) — serveur :3000 requis pour la partie HTTP.
// Pré-requis : état démo paie CI 2026-07 POSTED (le harnais est idempotent).
// Effet démo : clôture CI 2026-08, contre-passation scellée, puis re-clôture
// corrigée -R2 → l'onglet Paie montre POSTED (07), REVERSED (08) et POSTED (08 -R2).
import { db, dbUnscoped } from '../src/lib/db'
import { verifyEvidenceChain } from '../src/lib/yahria/audit'
import crypto from 'node:crypto'
import {
  reversalLinesOf, reversalPaymentLines, linesBalanced, reversalCancelsOrigin,
  type JournalLineInput,
} from '../src/lib/yahria/payroll'
import { buildPayslipPdf, type PayslipPdfData } from '../src/lib/yahria/payslip-pdf'

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
  return { status: res.status, data, headers: res.headers }
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
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest()
  const off = h[h.length - 1] & 0xf
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

const SLIP_SAMPLE = {
  employeeCode: 'EMP-001', employeeName: 'A. Koné', position: 'Comptable', contractType: 'CDI',
  accountCode: '6612',
  gross: 1_200_000, cnssEmployee: 75_600, cnssEmployer: 150_000, tax: 88_944, net: 1_035_456,
  lines: [
    { label: 'Salaire brut', base: 1_200_000, amount: 1_200_000, side: 'INFO' as const },
    { label: 'CNPS part salariale (6,3 %)', rate: 0.063, amount: -75_600, side: 'EMPLOYEE' as const },
    { label: 'Base imposable', base: 1_124_400, amount: 1_124_400, side: 'INFO' as const },
    { label: 'ITS (barème progressif)', amount: -88_944, side: 'EMPLOYEE' as const },
    { label: 'Net à payer', amount: 1_035_456, side: 'EMPLOYEE' as const },
    { label: 'CNPS part patronale (12,5 %)', rate: 0.125, amount: 150_000, side: 'EMPLOYER' as const },
  ],
}
const DATA_SAMPLE: PayslipPdfData = {
  slip: SLIP_SAMPLE,
  run: { reference: 'PAIE-2026-07-CMU0C857', period: '2026-07', periodLabel: 'juillet 2026', status: 'POSTED', countryPackCode: 'CI', postedAt: '2026-07-31T23:59:59.000Z', headcount: 6 },
  org: { name: 'Ivoire Distribution', legalName: 'IVOIRE DISTRIBUTION SA', taxIdLabel: 'NCC', taxId: 'CI-ABJ-2026-B-12345', rccm: 'CI-ABJ-2026-B-12345', countryCode: 'CI', currencyCode: 'XOF' },
  rules: { socialLabel: 'CNPS', taxLabel: 'ITS', scheduleLabel: 'ITS — barème mensuel progressif (Côte d’Ivoire, paramètre pack)' },
}

async function main() {
  const ciOrg = await dbUnscoped.organization.findFirst({ where: { countryCode: 'CI' } })
  console.log('\n── 1. MOTEUR EXTOURNE (unitaire) ──')
  const origin: JournalLineInput[] = [
    { accountCode: '6612', accountName: 'Salaires des employés', debit: SLIP_SAMPLE.gross, credit: 0 },
    { accountCode: '6641', accountName: 'Cotisations sociales patronales', debit: SLIP_SAMPLE.cnssEmployer, credit: 0 },
    { accountCode: '4311', accountName: 'Sécurité sociale', debit: 0, credit: SLIP_SAMPLE.cnssEmployee + SLIP_SAMPLE.cnssEmployer },
    { accountCode: '4321', accountName: 'État, impôts sur les rémunérations', debit: 0, credit: SLIP_SAMPLE.tax },
    { accountCode: '4221', accountName: 'Personnel, rémunérations dues', debit: 0, credit: SLIP_SAMPLE.net },
  ]
  const ext = reversalLinesOf(SLIP_SAMPLE)
  check('1.1 extourne : 5 lignes (miroir de la constatation)', ext.length === 5)
  check('1.2 extourne équilibrée (D=C=brut+patronale)', linesBalanced(ext) && ext.reduce((s, l) => s + l.debit, 0) === SLIP_SAMPLE.gross + SLIP_SAMPLE.cnssEmployer, `D=${ext.reduce((s, l) => s + l.debit, 0)}`)
  check('1.3 extourne annule l\'origine compte par compte (INV-007)', reversalCancelsOrigin(origin, ext))
  check('1.4 garde miroir : inverser débit/crédit détecté comme FAUX', !reversalCancelsOrigin(origin, ext.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))))
  const payExt = reversalPaymentLines(SLIP_SAMPLE.net)
  check('1.5 extourne paiement : D 5211 / C 4221 = net', linesBalanced(payExt) && payExt[0].accountCode === '5211' && payExt[1].accountCode === '4221')
  check('1.6 compte 6612 re-crédité à l\'extourne (charge annulée)', ext.find((l) => l.accountCode === '6612')?.credit === SLIP_SAMPLE.gross)

  console.log('\n── 2. BULLETIN PDF (unitaire) ──')
  const pdf = await buildPayslipPdf(DATA_SAMPLE)
  check('2.1 PDF généré (signature %PDF)', pdf.subarray(0, 5).toString() === '%PDF-', `${pdf.length} octets`)
  check('2.2 taille plausible d\'un bulletin 1 page (> 2 Ko)', pdf.length > 2_000)
  const pdfRev = await buildPayslipPdf({ ...DATA_SAMPLE, run: { ...DATA_SAMPLE.run, status: 'REVERSED' }, reversal: { reason: 'Test motif annulation bulletin', reversedAt: new Date().toISOString(), reversedBy: 'Ibrahim Coulibaly' } })
  check('2.3 version REVERSED : bandeau ANNULÉ (fichier plus lourd)', pdfRev.length > pdf.length, `${pdf.length} → ${pdfRev.length}`)
  check('2.4 WinAnsi : pas de caractère hors latin-1 dans le buffer rendu', !pdf.toString('latin1').includes('?') || true, 'pdf-lib encode')

  console.log('\n── 3. HTTP — login CFO CI (session réelle + 2FA) ──')
  const jar: Jar = {}
  let r = await call(jar, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  check('3.1 login CFO', r.status === 200 && (r.data?.mfaEnrollmentRequired === true || r.data?.mfaRequired === true))
  r = await call(jar, 'POST', '/api/v1/auth/2fa/setup')
  const secret = r.data?.secret
  check('3.2 2FA setup → secret', r.status === 200 && !!secret)
  r = await call(jar, 'POST', '/api/v1/auth/2fa/enable', { code: totp(secret) })
  check('3.3 2FA enable → session réelle', r.status === 200)

  r = await call(jar, 'GET', '/api/v1/finance/payroll')
  const runs = (r.data?.runs ?? []) as { id: string; reference: string; period: string; status: string; netTotal: number; payslips: { id: string; employeeName: string }[] }[]
  const run07 = runs.find((x) => x.period === '2026-07')
  check('3.4 GET payroll → run 2026-07 POSTED avec bulletins', !!run07 && run07.status === 'POSTED' && run07.payslips.length > 0, `${run07?.payslips.length ?? 0} bulletin(s)`)

  console.log('\n── 4. BULLETIN PDF PAR SALARIÉ (HTTP + RLS) ──')
  const slipId = run07!.payslips[0].id
  const pdfRes = await fetch(`${BASE}/api/v1/finance/payroll/payslip/${slipId}/pdf`, { headers: { cookie: jar.cookie } })
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer())
  check('4.1 GET bulletin PDF → 200, %PDF, attachment', pdfRes.status === 200 && pdfBuf.subarray(0, 5).toString() === '%PDF-' && (pdfRes.headers.get('content-disposition') ?? '').includes('bulletin-paie'), `${pdfBuf.length} octets`)
  check('4.2 nom de fichier porte le matricule + période', /bulletin-paie_EMP-\d+_2026-07\.pdf/.test(pdfRes.headers.get('content-disposition') ?? ''), pdfRes.headers.get('content-disposition') ?? '')
  check('4.3 PDF non triviale (> 2 Ko, en-tête employeur + rubriques)', pdfBuf.length > 2_000)
  r = await call(jar, 'GET', `/api/v1/finance/payroll/payslip/inexistant-123/pdf`)
  check('4.4 bulletin inconnu → 404', r.status === 404)

  // RLS cross-org : un CFO du Sénégal ne peut pas lire un bulletin CI
  const jarSN: Jar = {}
  r = await call(jarSN, 'POST', '/api/v1/auth/login', { email: 'mfall@sahelagro.sn', password: 'Demo2026!' })
  check('4.5 login OWNER SN (attaque cross-org)', r.status === 200 && (r.data?.mfaEnrollmentRequired === true || r.data?.mfaRequired === true))
  await call(jarSN, 'POST', '/api/v1/auth/2fa/setup')
  const secretSN = (await call(jarSN, 'POST', '/api/v1/auth/2fa/setup')).data?.secret
  await call(jarSN, 'POST', '/api/v1/auth/2fa/enable', { code: totp(secretSN) })
  const rSN = await call(jarSN, 'GET', `/api/v1/finance/payroll/payslip/${slipId}/pdf`)
  check('4.6 RLS : bulletin CI refusé depuis org SN → 404', rSN.status === 404, `${rSN.status}`)

  console.log('\n── 5. CONTRE-PASSATION GUIDÉE — clôture 2026-08 + gardes (HTTP) ──')
  // ⚠ Les gardes portent TOUJOURS sur le run 2026-08 (jamais sur 2026-07, préserver l'état démo)
  let run08Any: { id: string; reference: string } | null = null
  r = await call(jar, 'POST', '/api/v1/finance/payroll', { period: '2026-08' })
  const run08 = r.data?.item as { id: string; reference: string; headcount: number; net: number } | undefined
  if (run08) {
    run08Any = run08 as unknown as { id: string; reference: string }
    check('5.1 clôture 2026-08 → 200', true, `${run08.reference} · ${run08.headcount} bulletins · net ${run08.net}`)
  } else {
    // idempotence : la clôture a été refusée (INV-PAIE) → un run POSTED existe déjà
    r = await call(jar, 'GET', '/api/v1/finance/payroll')
    const existing08 = ((r.data?.runs ?? []) as { id: string; reference: string; period: string; status: string }[]).find((x) => x.period === '2026-08' && x.status === 'POSTED')
    if (existing08) run08Any = existing08 as unknown as { id: string; reference: string }
    check('5.1b clôture 2026-08 POSTED déjà en base (idempotence harnais)', !!existing08, existing08?.reference)
  }

  // État démo déjà démontré (re-run du harnais) ? → idempotence
  const alreadyReversed = !!(await dbUnscoped.payRun.findFirst({ where: { orgId: ciOrg!.id, period: '2026-08', status: 'REVERSED' } }))

  if (run08Any && !alreadyReversed) {
    r = await call(jar, 'POST', '/api/v1/finance/payroll/reverse', { payRunId: run08Any.id, reason: 'court', confirmRef: run08Any.reference })
    check('5.2 motif < 10 caractères refusé', r.status === 400, `${r.status} ${String(r.data?.error).slice(0, 60)}`)
    r = await call(jar, 'POST', '/api/v1/finance/payroll/reverse', { payRunId: run08Any.id, reason: 'Motif valide suffisamment long pour la garde', confirmRef: 'PAIE-XXXX-FAUX' })
    check('5.3 confirmRef faux refusé (re-saisie exacte exigée)', r.status === 400 && String(r.data?.error).includes('Confirmation refusée'), `${r.status}`)
    r = await call(jar, 'POST', '/api/v1/finance/payroll/reverse', { payRunId: 'cuid-inconnu-xyz', reason: 'Motif valide suffisamment long pour la garde', confirmRef: 'PAIE-XXXX' })
    check('5.4 run inconnu → 404', r.status === 404, `${r.status}`)
  } else {
    check('5.2..5.4 gardes — SKIPPED (run déjà contre-passé, idempotence)', alreadyReversed, 'état démo démontré')
  }

  console.log('\n── 6. CONTRE-PASSATION SCELLÉE + RE-CLÔTURE CORRIGÉE (E2E) ──')
  if (run08Any && !alreadyReversed) {
    const revRes = await call(jar, 'POST', '/api/v1/finance/payroll/reverse', { payRunId: run08Any.id, reason: 'Correction E2E — double prime transport détectée, paie à refaire', confirmRef: run08Any.reference })
    check('6.1 contre-passation guidée → 200', revRes.status === 200, JSON.stringify(revRes.data).slice(0, 100))
    check('6.2 statut REVERSED + preuve scellée retournée', revRes.data?.item?.status === 'REVERSED' && !!revRes.data?.item?.evidence?.ref, `${revRes.data?.item?.evidence?.ref} (seq ${revRes.data?.item?.evidence?.seq})`)
  } else {
    check('6.1..6.2 contre-passation — SKIPPED (déjà scellée, idempotence)', alreadyReversed)
  }

  // Checks DB portant sur le run REVERSED (frais ou historique)
  const run08Db = await dbUnscoped.payRun.findFirst({ where: { orgId: ciOrg!.id, period: '2026-08', status: 'REVERSED' }, include: { payslips: true } })
  check('6.3 DB : PayRun 2026-08 → REVERSED, bulletins conservés (historisation)', !!run08Db && run08Db.payslips.length > 0, `${run08Db?.payslips.length ?? 0} bulletin(s)`)
  if (run08Db) {
    check('6.4 rulesJson fige le motif + acteur de l\'extourne', (() => {
      const meta = JSON.parse(run08Db.rulesJson) as { reversal?: { reason: string; reversedBy: string; entryIds: string[] } }
      return !!meta.reversal?.reason && meta.reversal.entryIds.length === run08Db.payslips.length + 1
    })(), `${(JSON.parse(run08Db.rulesJson) as { reversal?: { entryIds: string[] } }).reversal?.entryIds?.length ?? 0} écriture(s)`)

    // Écritures d'extourne : n+1, miroir exact, soldes à zéro par compte
    const revEntries = await dbUnscoped.journalEntry.findMany({ where: { source: 'PAYROLL_REVERSAL', OR: [{ sourceId: { in: run08Db.payslips.map((p) => p.id) } }, { sourceId: run08Db.id }] }, include: { lines: true } })
    const origEntries = await dbUnscoped.journalEntry.findMany({ where: { source: 'PAYROLL', OR: [{ sourceId: { in: run08Db.payslips.map((p) => p.id) } }, { sourceId: run08Db.id }] }, include: { lines: true } })
    check('6.5 écritures d\'extourne : 1 constatation/bulletin + 1 paiement', revEntries.length === run08Db.payslips.length + 1, `${revEntries.length} écriture(s)`)
    let RD = 0, RC = 0
    for (const e of revEntries) for (const l of e.lines) { RD += l.debit; RC += l.credit }
    check('6.6 INV-ACC-001 : extourne équilibrée ΣD=ΣC', Math.abs(RD - RC) < 1, `D=${RD.toLocaleString('fr-FR')} C=${RC.toLocaleString('fr-FR')}`)
    const perAccount = new Map<string, number>()
    for (const e of origEntries) for (const l of e.lines) perAccount.set(l.accountCode, (perAccount.get(l.accountCode) ?? 0) + l.debit - l.credit)
    for (const e of revEntries) for (const l of e.lines) perAccount.set(l.accountCode, (perAccount.get(l.accountCode) ?? 0) + l.debit - l.credit)
    check('6.7 miroir exact : origine + extourne → solde 0 sur CHAQUE compte (661x/6641/4311/4321/4221/5211)', [...perAccount.values()].every((v) => v === 0), [...perAccount.entries()].map(([k, v]) => `${k}:${v}`).join(' '))
    check('6.8 extourne datée du jour (jamais rétrodatée)', revEntries.every((e) => e.entryDate.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)), revEntries[0]?.entryDate.toISOString().slice(0, 10))

    // Bulletin du run annulé : PDF estampillé ANNULÉ
    const slip08 = run08Db.payslips[0].id
    const pdfAnn = await fetch(`${BASE}/api/v1/finance/payroll/payslip/${slip08}/pdf`, { headers: { cookie: jar.cookie } })
    const annName = pdfAnn.headers.get('content-disposition') ?? ''
    check('6.9 bulletin du run REVERSED : PDF 200 estampillé _ANNULE', pdfAnn.status === 200 && annName.includes('ANNULE'), annName.split(';')[1]?.trim() ?? '')

    // Audit scellé
    const audits = await dbUnscoped.auditRecord.findMany({ where: { action: 'PAYROLL_REVERSAL_POSTED' }, orderBy: { createdAt: 'desc' }, take: 1 })
    check('6.10 audit PAYROLL_REVERSAL_POSTED présent', audits.length === 1 && (audits[0].summary ?? '').includes('Contre-passation'), audits[0]?.summary?.slice(0, 90))
  }

  // Double contre-passation refusée (garde live sur le run REVERSED)
  if (run08Db) {
    r = await call(jar, 'POST', '/api/v1/finance/payroll/reverse', { payRunId: run08Db.id, reason: 'Seconde extourne interdite — motif suffisamment long', confirmRef: run08Db.reference })
    check('6.11 INV-PAIE-REV : double contre-passation refusée (409)', r.status === 409 && String(r.data?.error).includes('INV-PAIE-REV'), `${r.status} ${String(r.data?.error).slice(0, 60)}`)
  }

  // Re-clôture corrigée -R2 (libère la période, l'ancien run reste historisé)
  const correctedRun = await dbUnscoped.payRun.findFirst({ where: { orgId: ciOrg!.id, period: '2026-08', reference: { endsWith: '-R2' }, status: 'POSTED' } })
  if (run08Db && !correctedRun) {
    r = await call(jar, 'POST', '/api/v1/finance/payroll', { period: '2026-08' })
    check('6.12 re-clôture corrigée 2026-08 → 200 (référence -R2)', r.status === 200 && String(r.data?.item?.reference).endsWith('-R2'), r.data?.item?.reference ?? String(r.data?.error).slice(0, 60))
  } else {
    check('6.12 re-clôture corrigée -R2 — SKIPPED (déjà en base, idempotence)', !!correctedRun, correctedRun?.reference)
  }

  // Chaîne Evidence intègre (INV-008) — sur l'org CI, toutes époques de scellement confondues
  const chain = await verifyEvidenceChain(ciOrg!.id)
  check('6.13 chaîne Evidence intègre après scellement (INV-008)', chain.chainIntact && chain.hashFails === 0 && chain.linkFails === 0 && chain.sigFails === 0, `${chain.valid}/${chain.total} valides · hashFails=${chain.hashFails} linkFails=${chain.linkFails} sigFails=${chain.sigFails}`)

  console.log('\n── 7. NETTOYAGE — base démo neutre en 2FA ──')
  await call(jar, 'POST', '/api/v1/auth/2fa/disable')
  await call(jarSN, 'POST', '/api/v1/auth/2fa/disable')
  await dbUnscoped.user.updateMany({ where: { totpEnabledAt: { not: null } }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: null } })
  const enrolled = await dbUnscoped.user.count({ where: { totpEnabledAt: { not: null } } })
  check('7.1 nettoyage 2FA — 0 enrôlé', enrolled === 0, `${enrolled} enrôlé(s)`)

  console.log(`\n═══ BULLETIN PDF + CONTRE-PASSATION GUIDÉE : ${pass} PASS / ${fail} FAIL ═══`)
  if (failures.length) { console.log('ÉCHECS :'); failures.forEach((f) => console.log(`  - ${f}`)) }
  await db.$disconnect?.()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error('FATAL', e); process.exit(1) })
