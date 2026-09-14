// YAHRIA — TESTS DE CHARGE : exports SYSCOHADA
// Phase A (volumique) : org dédiée « Charge Lab » (sans utilisateur → invisible en démo),
//   ~11 000 écritures / ~30 000 lignes, pipeline export mesuré au niveau lib.
// Phase B (concurrence) : 60 requêtes HTTP réelles (concurrence 10) sur le serveur :3000.
// Usage : npx tsx scripts/loadtest_exports.ts
import { db, dbUnscoped, runWithRls } from '../src/lib/db'
import {
  loadExportMeta, loadEntries, computeBalance, computeLettrage, computeGrandLivre, computeJournaux,
} from '../src/lib/yahria/ohada'
import { buildBalanceXlsx, buildGrandLivreXlsx, buildJournauxXlsx } from '../src/lib/yahria/ohada-xlsx'
import { buildBalancePdf, buildGrandLivrePdf, buildJournauxPdf } from '../src/lib/yahria/ohada-pdf'
import fs from 'node:fs'

const MARKER = 'LOADTEST_V1'
const N_INV = 4_000
const N_EXP = 3_000
const N_PAY = 4_000
const PAID_INVOICES = 500 // lettrage exercé sur un sous-ensemble

let pass = 0
let fail = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`) }
  else { fail++; failures.push(label); console.log(`  ✗ ${label} — ${detail}`) }
}
function ms(v: number): string { return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(0)} ms` }
function stats(runs: number[]): { min: number; med: number; max: number } {
  const s = [...runs].sort((a, b) => a - b)
  return { min: s[0], med: s[Math.floor(s.length / 2)], max: s[s.length - 1] }
}

interface Jar { cookie?: string }
const BASE = 'http://localhost:3000'
async function call(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(jar.cookie ? { cookie: jar.cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const sc = res.headers.get('set-cookie')
  if (sc?.includes('yahria_session=')) jar.cookie = sc.split(';')[0]
  let data: any = null
  try { data = await res.json() } catch { /* binaire */ }
  return { status: res.status, data }
}
function totpOf(secret: string): string {
  // TOTP SHA-1 30s 6 chiffres (démo) — import lib éviter : script autonome
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const out: number[] = []
  for (const c of secret.replace(/=+$/, '').toUpperCase()) {
    const idx = alphabet.indexOf(c)
    if (idx === -1) continue
    value = (value << 5) | idx; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  const counter = Math.floor(Date.now() / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter % 2 ** 32, 4)
  const hmac = require('node:crypto').createHmac('sha1', Buffer.from(out)).update(buf).digest()
  const off = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

let seq = 0
const RUN = Date.now().toString(36) // ids uniques par run — pas de collision inter-runs
const nid = (p: string) => `${p}${RUN}${String(++seq).padStart(7, '0')}`

async function main() {
  const t0 = Date.now()

  // ── Org Charge Lab (idempotente) ─────────────────────────────────────────
  let tenant = await dbUnscoped.tenant.findFirst({ where: { name: 'YAHRIA Load Lab' } })
  if (!tenant) tenant = await dbUnscoped.tenant.create({ data: { name: 'YAHRIA Load Lab', slug: 'yahria-load-lab', plan: 'LOADTEST' } })
  let org = await dbUnscoped.organization.findFirst({ where: { name: 'Charge Lab 50k' } })
  if (!org) {
    org = await dbUnscoped.organization.create({
      data: {
        tenantId: tenant.id, name: 'Charge Lab 50k', legalName: 'CHARGE LAB 50K SARL', countryCode: 'CI',
        city: 'Abidjan', currencyCode: 'XOF', sectorCode: 'ENTERPRISE', taxId: '0000000 L', rccm: 'CI-ABJ-2026-B-00000',
      },
    })
  }
  console.log(`\n── PHASE A : volumique — org ${org.name} (${org.id.slice(0, 8)}) ──`)

  const marker = await dbUnscoped.auditRecord.findFirst({ where: { orgId: org.id, action: MARKER } })
  const entryCount = await dbUnscoped.journalEntry.count({ where: { orgId: org.id } })

  if (!marker && entryCount < N_INV + N_EXP + N_PAY) {
    const tCreate = Date.now()
    // Référentiel minimal (idempotent : sauté si déjà présent)
    const haveCustomers = await dbUnscoped.customer.count({ where: { orgId: org.id, code: { startsWith: 'LD-C-' } } })
    const customerIds: string[] = []
    if (haveCustomers >= 40) {
      const rows = await dbUnscoped.customer.findMany({ where: { orgId: org.id, code: { startsWith: 'LD-C-' } }, orderBy: { code: 'asc' } })
      customerIds.push(...rows.map((r) => r.id))
    } else {
      for (let i = 0; i < 40; i++) customerIds.push(nid('ldc'))
      await dbUnscoped.customer.createMany({
        data: customerIds.map((id, i) => ({ id, orgId: org!.id, code: `LD-C-${i}`, name: `Client Lab ${i}`, segment: 'SME' })),
      })
    }
    const haveSuppliers = await dbUnscoped.supplier.count({ where: { orgId: org.id, code: { startsWith: 'LD-F-' } } })
    const supplierIds: string[] = []
    if (haveSuppliers >= 24) {
      const rows = await dbUnscoped.supplier.findMany({ where: { orgId: org.id, code: { startsWith: 'LD-F-' } }, orderBy: { code: 'asc' } })
      supplierIds.push(...rows.map((r) => r.id))
    } else {
      for (let i = 0; i < 24; i++) supplierIds.push(nid('lds'))
      await dbUnscoped.supplier.createMany({
        data: supplierIds.map((id, i) => ({ id, orgId: org!.id, code: `LD-F-${i}`, name: `Fournisseur Lab ${i}`, category: 'SUPPLIES' })),
      })
    }

    const L = (entryId: string, code: string, name: string, debit: number, credit: number) => ({ id: nid('ldl'), entryId, accountCode: code, accountName: name, debit, credit })
    const ACC = { cli: ['411', 'Clients'], frs: ['401', 'Fournisseurs'], tvaC: ['4431', 'État - TVA collectée'], tvaR: ['4452', 'État - TVA récupérable'], bank: ['521', 'Banques'], ach: ['601', 'Achats'], vte: ['701', 'Ventes'] } as const

    const entries: any[] = []
    const lines: any[] = []
    const invoices: any[] = []
    const expenses: any[] = []
    const payments: any[] = []

    for (let i = 0; i < N_INV; i++) {
      const month = i % 9
      const when = new Date(Date.UTC(2026, month, 1 + (i % 28), 8, 0, 0))
      const ht = 50_000 + (i % 47) * 10_000
      const tva = Math.round(ht * 0.18)
      const ttc = ht + tva
      const invId = nid('ldi')
      invoices.push({ id: invId, orgId: org.id, number: `LD-FA-${i}`, customerId: customerIds[i % customerIds.length], status: 'SENT', issueDate: when, dueDate: new Date(when.getTime() + 30 * 86400_000), subtotal: ht, vatRate: 0.18, vatAmount: tva, total: ttc })
      const eId = nid('ldj')
      entries.push({ id: eId, orgId: org.id, entryDate: when, reference: `FAC/LD-FA-${i}`, description: `Facture labo ${i}`, source: 'INVOICE', sourceId: invId, posted: true })
      lines.push(L(eId, ACC.cli[0], ACC.cli[1], ttc, 0), L(eId, ACC.vte[0], ACC.vte[1], 0, ht), L(eId, ACC.tvaC[0], ACC.tvaC[1], 0, tva))
    }
    for (let i = 0; i < N_EXP; i++) {
      const month = i % 9
      const when = new Date(Date.UTC(2026, month, 2 + (i % 26), 9, 0, 0))
      const ht = 20_000 + (i % 31) * 5_000
      const tva = Math.round(ht * 0.18)
      const ttc = ht + tva
      const expId = nid('lde')
      expenses.push({ id: expId, orgId: org.id, reference: `LD-DEP-${i}`, category: 'SUPPLIES', description: `Charge labo ${i}`, amount: ht, vatAmount: tva, supplierId: supplierIds[i % supplierIds.length], status: 'APPROVED', expenseDate: when })
      const eId = nid('ldj')
      entries.push({ id: eId, orgId: org.id, entryDate: when, reference: `ACH/LD-DEP-${i}`, description: `Charge labo ${i}`, source: 'EXPENSE', sourceId: expId, posted: true })
      lines.push(L(eId, ACC.ach[0], ACC.ach[1], ht, 0), L(eId, ACC.tvaR[0], ACC.tvaR[1], tva, 0), L(eId, ACC.frs[0], ACC.frs[1], 0, ttc))
    }
    const paidSet = new Set(Array.from({ length: PAID_INVOICES }, (_, k) => k * Math.floor(N_INV / PAID_INVOICES)))
    for (let i = 0; i < N_PAY; i++) {
      const month = i % 9
      const when = new Date(Date.UTC(2026, month, 3 + (i % 25), 10, 0, 0))
      const isCollection = i % 2 === 0
      const invIdx = isCollection ? Math.floor(i / 2) % N_INV : -1
      const expIdx = !isCollection ? Math.floor(i / 2) % N_EXP : -1
      const amount = isCollection ? (invoices[invIdx].total as number) : (expenses[expIdx].amount as number) + (expenses[expIdx].vatAmount as number)
      const payId = nid('ldp')
      const eId = nid('ldj')
      if (isCollection && paidSet.has(invIdx)) payments.push({ id: payId, orgId: org.id, reference: `LD-ENC-${i}`, idempotencyKey: `ld-enc-${i}`, type: 'COLLECTION', direction: 'IN', amount, counterpartyName: 'Lab', counterpartyType: 'CUSTOMER', method: 'BANK_TRANSFER', provider: 'SGCI', invoiceId: invoices[invIdx].id, status: 'EXECUTED', executedAt: when, timeline: '[]' })
      else if (isCollection) payments.push({ id: payId, orgId: org.id, reference: `LD-ENC-${i}`, idempotencyKey: `ld-enc-${i}`, type: 'COLLECTION', direction: 'IN', amount, counterpartyName: 'Lab', counterpartyType: 'CUSTOMER', method: 'BANK_TRANSFER', provider: 'SGCI', status: 'EXECUTED', executedAt: when, timeline: '[]' })
      else payments.push({ id: payId, orgId: org.id, reference: `LD-DEC-${i}`, idempotencyKey: `ld-dec-${i}`, type: 'DISBURSEMENT', direction: 'OUT', amount, counterpartyName: 'Lab F', counterpartyType: 'SUPPLIER', method: 'BANK_TRANSFER', provider: 'SGCI', expenseId: expenses[expIdx].id, status: 'EXECUTED', executedAt: when, timeline: '[]' })
      if (isCollection) {
        entries.push({ id: eId, orgId: org.id, entryDate: when, reference: `TRE/LD-ENC-${i}`, description: `Encaissement labo ${i}`, source: 'PAYMENT', sourceId: payId, posted: true })
        lines.push(L(eId, ACC.bank[0], ACC.bank[1], amount, 0), L(eId, ACC.cli[0], ACC.cli[1], 0, amount))
      } else {
        entries.push({ id: eId, orgId: org.id, entryDate: when, reference: `TRE/LD-DEC-${i}`, description: `Décaissement labo ${i}`, source: 'PAYMENT', sourceId: payId, posted: true })
        lines.push(L(eId, ACC.frs[0], ACC.frs[1], amount, 0), L(eId, ACC.bank[0], ACC.bank[1], 0, amount))
      }
    }

    // Collections sur factures payées : rattacher aussi les JE INVOICE au lettrage via payment.invoiceId (déjà fait ci-dessus pour paidSet)
    await dbUnscoped.invoice.createMany({ data: invoices })
    await dbUnscoped.expense.createMany({ data: expenses })
    await dbUnscoped.journalEntry.createMany({ data: entries })
    for (let i = 0; i < lines.length; i += 5_000) await dbUnscoped.ledgerLine.createMany({ data: lines.slice(i, i + 5_000) })
    for (let i = 0; i < payments.length; i += 2_000) await dbUnscoped.payment.createMany({ data: payments.slice(i, i + 2_000) })
    const createMs = Date.now() - tCreate
    console.log(`  volume créé en ${ms(createMs)} : ${invoices.length} factures, ${expenses.length} charges, ${payments.length} règlements, ${entries.length} écritures, ${lines.length} lignes`)
    await dbUnscoped.auditRecord.create({
      data: { orgId: org.id, traceId: `loadtest-${Date.now()}`, actorType: 'SYSTEM', actorId: 'load', actorName: 'Load Test', action: MARKER, resourceType: 'ORGANIZATION', resourceId: org.id, summary: `Dataset de charge : ${entries.length} écritures / ${lines.length} lignes`, metaJson: JSON.stringify({ invoices: invoices.length, expenses: expenses.length, payments: payments.length, entries: entries.length, lines: lines.length, createMs }) },
    })
  } else {
    console.log('  volume déjà présent (marqueur) — étape de création ignorée')
  }

  // Équilibre
  const jes = await dbUnscoped.journalEntry.findMany({ where: { orgId: org.id, posted: true }, include: { lines: true } })
  let d = 0, c = 0
  for (const je of jes) for (const l of je.lines) { d += l.debit; c += l.credit }
  check(`A.1 équilibre partie double (ΣD=ΣC) sur ${jes.length} écritures`, d === c, `${d} XOF`)
  check('A.2 volume cible atteint', jes.length >= N_INV + N_EXP + N_PAY, `${jes.length} écritures`)

  // ── Mesures pipeline export (3 runs) ─────────────────────────────────────
  const from = new Date(Date.UTC(2026, 0, 1)), to = new Date(Date.UTC(2026, 11, 31, 23, 59, 59))
  const ctx = { tenantId: org.tenantId, orgId: org.id, userId: 'loadtest', role: 'OWNER' }
  const results: Record<string, { min: number; med: number; max: number; size?: number }> = {}

  const meta = await loadExportMeta(org.id, from, to)
  check('A.3 meta export (pack CI → NCC)', meta.taxIdLabel === 'NCC', meta.taxIdLabel)

  const tLoad: number[] = []
  let entriesLoaded: any[] = []
  for (let r = 0; r < 3; r++) {
    const t = Date.now()
    entriesLoaded = await runWithRls(ctx, () => loadEntries(org.id, from, to))
    tLoad.push(Date.now() - t)
  }
  results['loadEntries (11k écritures + 30k lignes, RLS)'] = stats(tLoad)
  check('A.4 lectures RLS complètes', entriesLoaded.length >= N_INV + N_EXP + N_PAY, `${entriesLoaded.length} écritures`)

  const balance = computeBalance(entriesLoaded)
  const bx: number[] = [], bp: number[] = []
  let bxSize = 0, bpSize = 0
  for (let r = 0; r < 3; r++) {
    let t = Date.now(); const x = await buildBalanceXlsx(balance, meta); bx.push(Date.now() - t); bxSize = x.length
    t = Date.now(); const p = await buildBalancePdf(balance, meta); bp.push(Date.now() - t); bpSize = p.length
  }
  results['balance XLSX'] = { ...stats(bx), size: bxSize }
  results['balance PDF'] = { ...stats(bp), size: bpSize }

  const tLet: number[] = []
  let lettrage: Map<string, string> = new Map()
  for (let r = 0; r < 3; r++) {
    const t = Date.now()
    lettrage = await computeLettrage(org.id)
    tLet.push(Date.now() - t)
  }
  results['lettrage (match facture↔règlement)'] = stats(tLet)
  check('A.5 lettrage calculé sur subset payé', lettrage.size >= 2 * PAID_INVOICES * 0.8, `${lettrage.size} écritures lettrées`)

  const gl = computeGrandLivre([], entriesLoaded, lettrage)
  const gx: number[] = [], gp: number[] = []
  let gxSize = 0, gpSize = 0
  for (let r = 0; r < 3; r++) {
    let t = Date.now(); const x = await buildGrandLivreXlsx(gl, meta); gx.push(Date.now() - t); gxSize = x.length
    t = Date.now(); const p = await buildGrandLivrePdf(gl, meta); gp.push(Date.now() - t); gpSize = p.length
  }
  results['grand livre XLSX'] = { ...stats(gx), size: gxSize }
  results['grand livre PDF'] = { ...stats(gp), size: gpSize }

  const jr = computeJournaux(entriesLoaded)
  const jx: number[] = [], jp: number[] = []
  let jxSize = 0, jpSize = 0
  for (let r = 0; r < 3; r++) {
    let t = Date.now(); const x = await buildJournauxXlsx(jr, meta); jx.push(Date.now() - t); jxSize = x.length
    t = Date.now(); const p = await buildJournauxPdf(jr, meta); jp.push(Date.now() - t); jpSize = p.length
  }
  results['journaux XLSX'] = { ...stats(jx), size: jxSize }
  results['journaux PDF'] = { ...stats(jp), size: jpSize }

  console.log('\n  ── Timings pipeline (min / médian / max) ──')
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k.padEnd(48)} ${ms(v.min).padStart(10)} ${ms(v.med).padStart(10)} ${ms(v.max).padStart(10)}${v.size ? `  (${(v.size / 1024).toFixed(0)} Ko)` : ''}`)
  }

  // ── PHASE B : concurrence HTTP ──────────────────────────────────────────
  console.log('\n── PHASE B : charge HTTP réelle (60 requêtes, concurrence 10) ──')
  const jar: Jar = {}
  let r = await call(jar, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  check('B.1 login CFO → enrôlement exigé', r.status === 200 && (r.data?.mfaEnrollmentRequired === true || r.data?.mfaRequired === true))
  r = await call(jar, 'POST', '/api/v1/auth/2fa/setup')
  const secret = r.data?.secret
  r = await call(jar, 'POST', '/api/v1/auth/2fa/enable', { code: totpOf(secret) })
  check('B.2 2FA activée → session réelle', r.status === 200 && r.data?.ok !== false)

  const targets: string[] = []
  for (let round = 0; round < 10; round++) {
    for (const t of ['balance', 'grandlivre', 'journal']) {
      for (const f of ['xlsx', 'pdf']) targets.push(`/api/v1/finance/export?type=${t}&format=${f}&from=2026-01-01&to=2026-12-31`)
    }
  }
  const lat: number[] = []
  let errors = 0
  let bytes = 0
  const tB = Date.now()
  const queue = [...targets]
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (queue.length) {
      const path = queue.shift()!
      const t = Date.now()
      try {
        const res = await fetch(`${BASE}${path}`, { headers: { cookie: jar.cookie! } })
        const ab = await res.arrayBuffer()
        bytes += ab.byteLength
        if (res.status !== 200) errors++
      } catch { errors++ }
      lat.push(Date.now() - t)
    }
  }))
  const wallB = Date.now() - tB
  const b = stats(lat)
  const p95 = lat.sort((a, z) => a - z)[Math.floor(lat.length * 0.95)]
  console.log(`  ${lat.length} requêtes — p50 ${ms(b.med)} · p95 ${ms(p95)} · max ${ms(b.max)} — erreurs ${errors} — débit ${(lat.length / (wallB / 1000)).toFixed(1)} req/s — ${(bytes / 1024 / 1024).toFixed(1)} Mo générés`)
  check('B.3 zéro erreur sous charge', errors === 0, `${errors} erreur(s)`)
  check('B.4 p95 < 5 s', p95 < 5000, `p95 ${ms(p95)}`)

  await call(jar, 'POST', '/api/v1/auth/2fa/disable')
  await dbUnscoped.user.updateMany({ where: { totpEnabledAt: { not: null } }, data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: null } })

  // ── Résultats persistés ─────────────────────────────────────────────────
  fs.mkdirSync('scripts/out_loadtest', { recursive: true })
  fs.writeFileSync('scripts/out_loadtest/results.json', JSON.stringify({
    date: new Date().toISOString(), org: org.name, entries: jes.length, lines: d,
    phaseA: results, phaseB: { requests: lat.length, p50: b.med, p95, max: b.max, errors, rps: +(lat.length / (wallB / 1000)).toFixed(2), bytes },
  }, null, 2))
  console.log(`\n  résultats → scripts/out_loadtest/results.json (durée totale ${ms(Date.now() - t0)})`)
  console.log(`\n═══ TESTS DE CHARGE : ${pass} PASS / ${fail} FAIL ═══`)
  if (failures.length) { console.log('ÉCHECS :', failures.join(' | ')); process.exit(1) }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
