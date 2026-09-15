/* eslint-disable @typescript-eslint/no-require-imports */
// YAHRIA BUSINESS OS V1 — Tests INV-008 Evidence : rotation de clé + re-scellement
// Scénario : les preuves datent d'une clé EVIDENCE_SIGNING_KEY antérieure (purge .env
// du push GitHub). ① État initial : 0/N signatures valides, contenu intouché.
// ② Re-scellement OWNER (allOrgs) → 17/17. ③ Refus si falsification réelle.
// ④ INV-007 append-only intact. Nettoyage 2FA en fin de run (état démo neutre).
const { PrismaClient } = require('@prisma/client')

const BASE = 'http://localhost:3000'
let pass = 0
let fail = 0
const fails = []

function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    fails.push(name)
    console.log(`  ❌ ${name} ${detail ? `— ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`)
}

const prisma = new PrismaClient()

// ── Harness HTTP (cookie jar minimal) ──
function jar() {
  return { cookie: undefined }
}
async function call(j, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(j.cookie ? { cookie: j.cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie?.includes('yahria_session=')) j.cookie = setCookie.split(';')[0]
  return res
}
async function jsonOf(res) {
  try { return await res.json() } catch { return {} }
}

// ── TOTP RFC 6238 (HMAC-SHA1, 30 s, 6 chiffres) ──
const { createHmac } = require('node:crypto')
function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const out = []
  for (const c of s.toUpperCase()) {
    const i = A.indexOf(c)
    if (i === -1) continue
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return Buffer.from(out)
}
function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const o = h[h.length - 1] & 0xf
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

const PW = 'Demo2026!'
const OWNER = 'akone@ivoire-distribution.ci'

async function verifyAllOrgs() {
  // Vérification directe (le test est hors pile Prisma : recopie fidèle de verifyEvidenceChain)
  const rows = await prisma.evidence.findMany({ orderBy: [{ orgId: 'asc' }, { seq: 'asc' }] })
  const byOrg = new Map()
  for (const r of rows) {
    if (!byOrg.has(r.orgId)) byOrg.set(r.orgId, [])
    byOrg.get(r.orgId).push(r)
  }
  const report = {}
  for (const [orgId, list] of byOrg) {
    let valid = 0
    let prevSig = ''
    let prevHash = ''
    let hasPrev = false
    for (const r of list) {
      const { createHash } = require('node:crypto')
      const hashOk = createHash('sha256').update(`${r.payloadJson}|${r.ref}`).digest('hex').toUpperCase() === r.hash.toUpperCase()
      const { evidenceSignatureLocal } = { evidenceSignatureLocal: null }
      void evidenceSignatureLocal
      const signatureOk = sigMatches(r.ref, r.hash.toUpperCase(), r.prevHash, prevSig, r.signature)
      const linkOk = !hasPrev || r.prevHash === prevHash
      if (hashOk && signatureOk && linkOk) valid++
      prevSig = r.signature
      prevHash = r.hash
      hasPrev = true
    }
    report[orgId] = { valid, total: list.length }
  }
  return report
}

// HMAC local du test avec la clé .env COURANTE (le test lit process.env via dotenv ? non —
// on la passe en variable d'environnement au lancement : EVIDENCE_SIGNING_KEY est sourcé).
function sigMatches(ref, hash, prevHash, prevSig, stored) {
  const key = process.env.EVIDENCE_SIGNING_KEY || 'yahria-dev-signing-key-DO-NOT-USE-IN-PROD'
  const expected = createHmac('sha256', key).update(`${ref}|${hash}|${prevHash}|${prevSig}`).digest('hex').toUpperCase()
  return expected === String(stored).trim().toUpperCase()
}

async function main() {
  // ── ① ÉTAT INITIAL : rotation de clé diagnostiquée ──
  section('① ÉTAT INITIAL — signatures antérieures à la clé courante')
  const before = await verifyAllOrgs()
  const beforeRows = await prisma.evidence.findMany({ select: { id: true, hash: true, payloadJson: true, prevHash: true, seq: true, orgId: true } })
  const hashSnapshot = new Map(beforeRows.map((r) => [r.id, r.hash]))
  const totalBefore = Object.values(before).reduce((s, o) => s + o.total, 0)
  const validBefore = Object.values(before).reduce((s, o) => s + o.valid, 0)
  const wasBroken = validBefore < totalBefore
  if (wasBroken) {
    check(`chaîne initiale invalide : ${validBefore}/${totalBefore} valides (rotation de clé attendue)`, validBefore === 0 && totalBefore === 17, JSON.stringify(before))
  } else {
    check(`chaîne déjà re-scellée (re-run idempotent) : ${validBefore}/${totalBefore} valides`, totalBefore === 17, JSON.stringify(before))
  }

  // ── ② LOGIN OWNER + ENRÔLEMENT 2FA (le mur MFA restreint governance sinon) ──
  section('② SESSION OWNER — enrôlement 2FA (mur MFA)')
  const j = jar()
  const lr = await call(j, 'POST', '/api/v1/auth/login', { email: OWNER, password: PW })
  const ld = await jsonOf(lr)
  check('login OWNER → 200 + session', lr.status === 200 && !!j.cookie, `status=${lr.status}`)
  void ld

  let r = await call(j, 'POST', '/api/v1/auth/2fa/setup')
  const setup = await jsonOf(r)
  check('setup 2FA → 200 + secret', r.status === 200 && !!setup.secret, `status=${r.status}`)
  r = await call(j, 'POST', '/api/v1/auth/2fa/enable', { code: totp(setup.secret) })
  const enable = await jsonOf(r)
  check('enable 2FA → 200 + 8 codes de récupération', r.status === 200 && (enable.recoveryCodes ?? []).length === 8, `status=${r.status}`)

  // ── ③ GOVERNANCE AVANT : INV-008 FAIL avec diagnostic ROTATION DE CLÉ ──
  section('③ GOVERNANCE AVANT re-scellement — INV-008 FAIL diagnostiqué')
  r = await call(j, 'GET', '/api/v1/governance')
  const govBefore = await jsonOf(r)
  check('GET governance → 200', r.status === 200, `status=${r.status}`)
  const inv8Before = (govBefore.invariants ?? []).find((i) => i.id === 'INV-008')
  if (wasBroken) {
    check('INV-008 → FAIL avant re-scellement', inv8Before?.checkResult?.status === 'FAIL', JSON.stringify(inv8Before?.checkResult ?? {}))
    check('diagnostic = ROTATION DE CLÉ (contenu intact)', /ROTATION DE CLÉ/.test(inv8Before?.checkResult?.detail ?? ''), inv8Before?.checkResult?.detail ?? '')
    check('chaîne org1 : 0/7 signatures valides', govBefore.evidenceChain?.valid === 0 && govBefore.evidenceChain?.total === 7, JSON.stringify(govBefore.evidenceChain))
    check('0 hash altéré + 0 lien rompu (falsification exclue)', govBefore.evidenceChain?.hashFails === 0 && govBefore.evidenceChain?.linkFails === 0, '')
  } else {
    check('INV-008 → déjà PASS (re-run)', inv8Before?.checkResult?.status === 'PASS', JSON.stringify(inv8Before?.checkResult ?? {}))
  }

  // ── ④ PERMISSION : le re-scellement exige governance.admin ──
  section('④ PERMISSION — governance.admin requise')
  check('OWNER porte canTestIsolation (governance.admin)', govBefore.permissions?.canTestIsolation === true, JSON.stringify(govBefore.permissions ?? {}))

  // ── ⑤ RE-SCELLEMENT plateforme (allOrgs) ──
  section('⑤ RE-SCELLEMENT — signatures recalculées, contenu intouché')
  r = await call(j, 'POST', '/api/v1/governance', { action: 'RESEAL_EVIDENCE', allOrgs: true })
  const reseal = await jsonOf(r)
  check('RESEAL_EVIDENCE allOrgs → ok:true', r.status === 200 && reseal.ok === true, `status=${r.status} ${JSON.stringify(reseal).slice(0, 200)}`)
  check('17 signatures recalculées sur 3 organisations', reseal.resealed === 17 && reseal.orgs === 3, `resealed=${reseal.resealed} orgs=${reseal.orgs}`)
  check('post-vérification INTACTE pour chaque org', (reseal.reports ?? []).every((x) => x.ok && x.verified?.chainIntact), '')

  // ── ⑥ GOVERNANCE APRÈS : INV-008 PASS ──
  section('⑥ GOVERNANCE APRÈS — INV-008 PASS')
  r = await call(j, 'GET', '/api/v1/governance')
  const govAfter = await jsonOf(r)
  const inv8After = (govAfter.invariants ?? []).find((i) => i.id === 'INV-008')
  check('INV-008 → PASS après re-scellement', inv8After?.checkResult?.status === 'PASS', JSON.stringify(inv8After?.checkResult ?? {}))
  check('chaîne org1 : 7/7 signatures valides', govAfter.evidenceChain?.valid === 7 && govAfter.evidenceChain?.total === 7, JSON.stringify(govAfter.evidenceChain))
  check('détail = 1 réponse IA avec Evidence (inchangé)', /1 réponse\(s\) IA avec Evidence/.test(inv8After?.checkResult?.detail ?? ''), inv8After?.checkResult?.detail ?? '')

  // ── ⑦ INTÉGRITÉ DU CONTENU : hashs strictement inchangés ──
  section('⑦ CONTENU INCHANGÉ — hashs identiques avant/après')
  const afterRows = await prisma.evidence.findMany({ select: { id: true, hash: true, payloadJson: true, prevHash: true } })
  const hashUnchanged = afterRows.every((r0) => hashSnapshot.get(r0.id) === r0.hash)
  const payloadUnchanged = afterRows.every((r0) => {
    const b = beforeRows.find((x) => x.id === r0.id)
    return b && b.payloadJson === r0.payloadJson && b.prevHash === r0.prevHash
  })
  check('17/17 hashs SHA-256 strictement identiques', hashUnchanged, '')
  check('payloads + chaînage prevHash inchangés', payloadUnchanged, '')
  const allOrgsAfter = await verifyAllOrgs()
  const validAfter = Object.values(allOrgsAfter).reduce((s, o) => s + o.valid, 0)
  check(`plateforme entière : ${validAfter}/17 signatures valides`, validAfter === 17, JSON.stringify(allOrgsAfter))

  // ── ⑧ REFUS EN CAS DE FALSIFICATION RÉELLE ──
  section('⑧ ANTI-FALSIFICATION — re-scellement REFUSÉ si contenu altéré')
  const target = await prisma.evidence.findFirst({ where: { kind: 'AI_ANSWER' }, orderBy: { seq: 'asc' } })
  const originalPayload = target.payloadJson
  await prisma.$executeRawUnsafe(`UPDATE Evidence SET payloadJson = ? WHERE id = ?`, JSON.stringify({ ...JSON.parse(originalPayload), FALSIFIED: true }), target.id)
  r = await call(j, 'POST', '/api/v1/governance', { action: 'RESEAL_EVIDENCE' })
  const tamper = await jsonOf(r)
  const tamperReport = (tamper.reports ?? [])[0] ?? tamper
  check('re-scellement REFUSÉ (TAMPERING)', tamperReport.ok === false && tamperReport.reason === 'TAMPERING', JSON.stringify(tamperReport).slice(0, 220))
  check('0 signature recalculée lors du refus', tamperReport.resealed === 0, `resealed=${tamperReport.resealed}`)
  check('message d\u2019incident explicite', /falsification|altér/i.test(tamperReport.message ?? ''), tamperReport.message ?? '')
  // Restauration de la falsification (test-only) → la chaîne revient intacte
  await prisma.$executeRawUnsafe(`UPDATE Evidence SET payloadJson = ? WHERE id = ?`, originalPayload, target.id)
  const restored = await verifyAllOrgs()
  const validRestored = Object.values(restored).reduce((s, o) => s + o.valid, 0)
  check('chaîne restaurée après annulation de la falsification : 17/17', validRestored === 17, JSON.stringify(restored))

  // ── ⑨ AUDIT + INV-007 : le chemin append-only reste intact ──
  section('⑨ AUDIT & INV-007 — opération tracée, append-only intact')
  const auditEntry = await prisma.auditRecord.findFirst({ where: { action: 'EVIDENCE_RESEALED' }, orderBy: { createdAt: 'desc' } })
  check('audit EVIDENCE_RESEALED enregistré', !!auditEntry && /re-scellement/i.test(auditEntry.summary), auditEntry?.summary?.slice(0, 120) ?? 'absent')
  r = await call(j, 'POST', '/api/v1/governance', { action: 'RUN_INVARIANT_PROOFS' })
  const proofs = await jsonOf(r)
  check('preuves de construction 6/6 PASS (INV-007 non affaibli)', proofs.allPass === true, JSON.stringify((proofs.proofs ?? []).map((p) => `${p.id}:${p.status}`)))

  // ── ⑩ NETTOYAGE — état démo neutre (0 enrôlé) ──
  section('⑩ NETTOYAGE — 2FA OWNER désactivé')
  r = await call(j, 'POST', '/api/v1/auth/2fa/disable', { password: PW })
  check('disable 2FA → 200', r.status === 200, `status=${r.status}`)
  const enrolled = await prisma.user.count({ where: { totpEnabledAt: { not: null } } })
  check('base laissée propre : 0 utilisateur enrôlé', enrolled === 0, `enrolled=${enrolled}`)

  // ── BILAN ──
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nBILAN : ${pass} PASS / ${fail} FAIL`)
  if (fail) { console.log('Échecs : ' + fails.join(' | ')); process.exitCode = 1 }
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
