// YAHRIA BUSINESS OS V1 — Tests d'intégration ITERATION 4
// ① Sessions rotatives (TTL glissant implicite, rotation, réutilisation, révocation)
// ② 2FA TOTP (enrôlement, connexion 2 étapes, code de récupération, verrou OWNER/CFO)
// ③ Exports SYSCOHADA (3 documents × 2 formats, signature binaire)
import { createHmac } from 'node:crypto'
import { execSync } from 'node:child_process'

/** Pré-nettoyage : état 2FA des comptes de test remis à zéro en base — rend le
 *  run déterministe même si un run précédent a crashé en cours d'enrôlement. */
function resetAccount2fa(email: string) {
  execSync(
    `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.update({where:{email:'${email}'},data:{totpSecret:null,totpEnabledAt:null,recoveryCodes:null}}).then(()=>p.\\$disconnect())"`,
    { cwd: '/home/z/my-project', stdio: 'pipe' }
  )
}

const BASE = 'http://localhost:3000'
let pass = 0
let fail = 0
const fails: string[] = []

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    fails.push(name)
    console.log(`  ❌ ${name} ${detail ? `— ${detail}` : ''}`)
  }
}

interface Jar {
  cookie?: string
}
async function call(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(jar.cookie ? { cookie: jar.cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie?.includes('yahria_session=')) {
    jar.cookie = setCookie.split(';')[0]
  }
  return res
}

// TOTP RFC 6238 (HMAC-SHA1, 30 s, 6 chiffres) — pour piloter le flux 2FA
function base32Decode(s: string): Buffer {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const c of s.toUpperCase()) {
    const i = A.indexOf(c)
    if (i === -1) continue
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}
function totp(secret: string, driftSteps = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + driftSteps
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const o = h[h.length - 1] & 0xf
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

async function main() {
  resetAccount2fa('icoulibaly@ivoire-distribution.ci')
  resetAccount2fa('fdiomande@ivoire-distribution.ci')
  resetAccount2fa('akone@ivoire-distribution.ci')

  console.log('\n━━━ ① SESSIONS ROTATIVES ━━━')

  // — login OPS (sans 2FA)
  const ops: Jar = {}
  let r = await call(ops, 'POST', '/api/v1/auth/login', { email: 'ykouassi@ivoire-distribution.ci', password: 'Demo2026!' })
  let d = await r.json().catch(() => ({}))
  check('login OPS (sans 2FA) → 200', r.status === 200 && d.ok, JSON.stringify(d))

  // — listing des sessions
  r = await call(ops, 'GET', '/api/v1/auth/sessions')
  d = await r.json().catch(() => ({}))
  check('GET sessions → ≥1 active, courante marquée', r.status === 200 && (d.sessions ?? []).some((s: { current: boolean }) => s.current))
  const oldCookie = ops.cookie!

  // — rotation
  r = await call(ops, 'POST', '/api/v1/auth/session/rotate')
  d = await r.json().catch(() => ({}))
  check('rotation → 200 + nouveau cookie', r.status === 200 && !!ops.cookie && ops.cookie !== oldCookie)

  // — l'ancien token fonctionne ENCORE une fois ? Non : il est rotaté → replay détecté
  const replay: Jar = { cookie: oldCookie }
  r = await call(replay, 'GET', '/api/v1/auth/me')
  check('REJEU ancien token → 401 (détection de réutilisation)', r.status === 401)

  // — et la famille entière est révoquée : le nouveau token est mort aussi
  r = await call(ops, 'GET', '/api/v1/auth/me')
  check('FAMILLE révoquée : nouveau token également invalide (401)', r.status === 401, `status=${r.status}`)

  // — re-login propre + révocation ciblée
  const ops2: Jar = {}
  await call(ops2, 'POST', '/api/v1/auth/login', { email: 'ykouassi@ivoire-distribution.ci', password: 'Demo2026!' })
  const ops3: Jar = {}
  await call(ops3, 'POST', '/api/v1/auth/login', { email: 'ykouassi@ivoire-distribution.ci', password: 'Demo2026!' })
  r = await call(ops2, 'GET', '/api/v1/auth/sessions')
  d = await r.json()
  const others = (d.sessions ?? []).filter((s: { current: boolean }) => !s.current)
  check('deux sessions actives distinctes', (d.sessions ?? []).length >= 2)
  if (others[0]) {
    r = await call(ops2, 'DELETE', '/api/v1/auth/sessions', { id: others[0].id })
    d = await r.json().catch(() => ({}))
    check('révocation ciblée d\u2019une autre session', r.status === 200 && d.revoked === 1)
    r = await call(ops3, 'GET', '/api/v1/auth/me')
    check('la session révoquée est immédiatement invalide', r.status === 401)
  }
  // logout
  r = await call(ops2, 'POST', '/api/v1/auth/logout')
  r = await call(ops2, 'GET', '/api/v1/auth/me')
  check('logout → session invalide', r.status === 401)

  console.log('\n━━━ ② 2FA TOTP ━━━')

  // — verrou OWNER sans 2FA
  const owner: Jar = {}
  r = await call(owner, 'POST', '/api/v1/auth/login', { email: 'akone@ivoire-distribution.ci', password: 'Demo2026!' })
  d = await r.json().catch(() => ({}))
  check('login OWNER (sans 2FA) → 200', r.status === 200)
  r = await call(owner, 'GET', '/api/v1/dashboard')
  d = await r.json().catch(() => ({}))
  check('OWNER sans 2FA : API métier verrouillée (403 MFA_ENROLLMENT_REQUIRED)', r.status === 403 && d.code === 'MFA_ENROLLMENT_REQUIRED')
  r = await call(owner, 'GET', '/api/v1/auth/sessions')
  check('OWNER sans 2FA : routes auth.* accessibles', r.status === 200)

  // — enrôlement CFO
  const cfo: Jar = {}
  r = await call(cfo, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  d = await r.json().catch(() => ({}))
  check('login CFO (avant enrôlement) → 200 direct', r.status === 200 && d.ok)
  r = await call(cfo, 'POST', '/api/v1/auth/2fa/setup')
  d = await r.json().catch(() => ({}))
  const secret = d.secret
  check('2FA setup → secret + QR data URL', r.status === 200 && !!secret && String(d.qrDataUrl).startsWith('data:image/png'))
  r = await call(cfo, 'POST', '/api/v1/auth/2fa/enable', { code: '000000' })
  check('activation avec code erroné → refusée', r.status === 400)
  r = await call(cfo, 'POST', '/api/v1/auth/2fa/enable', { code: totp(secret) })
  d = await r.json().catch(() => ({}))
  check('activation avec code TOTP valide → 8 codes de récupération', r.status === 200 && (d.recoveryCodes ?? []).length === 8)
  const recoveryCode: string = d.recoveryCodes?.[0]

  // — re-login CFO : 2 étapes obligatoires
  const cfo2: Jar = {}
  r = await call(cfo2, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  d = await r.json().catch(() => ({}))
  check('re-login CFO → mfaRequired + challenge', r.status === 200 && d.mfaRequired === true && !!d.challenge)
  r = await call(cfo2, 'POST', '/api/v1/auth/2fa/verify', { challenge: d.challenge, code: '123456' })
  check('code TOTP erroné → 401', r.status === 401)
  // le défi est single-use : le re-vérifier doit échouer → re-login pour un challenge neuf
  r = await call(cfo2, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  d = await r.json()
  r = await call(cfo2, 'POST', '/api/v1/auth/2fa/verify', { challenge: d.challenge, code: totp(secret) })
  d = await r.json().catch(() => ({}))
  check('vérification 2FA avec code valide → session créée', r.status === 200 && d.ok)
  r = await call(cfo2, 'GET', '/api/v1/auth/me')
  d = await r.json().catch(() => ({}))
  check('/me → totpEnabled=true, mfaRequired=false', r.status === 200 && d.user?.totpEnabled === true && d.user?.mfaRequired === false)

  // — connexion via code de récupération
  const cfo3: Jar = {}
  r = await call(cfo3, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  d = await r.json()
  r = await call(cfo3, 'POST', '/api/v1/auth/2fa/verify', { challenge: d.challenge, code: recoveryCode })
  d = await r.json().catch(() => ({}))
  check('connexion via code de récupération (usage unique)', r.status === 200 && d.viaRecovery === true)
  // même code réutilisé → refusé
  const cfo4: Jar = {}
  r = await call(cfo4, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  d = await r.json()
  r = await call(cfo4, 'POST', '/api/v1/auth/2fa/verify', { challenge: d.challenge, code: recoveryCode })
  check('code de récupération REJETÉ à la 2ᵉ utilisation', r.status === 401)

  console.log('\n━━━ ③ EXPORTS SYSCOHADA ━━━')

  // Depuis le verrouillage 2FA par vagues (SEC-003, vague 2 : ADMIN/ACCOUNTANT),
  // le comptable doit être ENRÔLÉ pour accéder aux routes métier d'export.
  const exp: Jar = {}
  await call(exp, 'POST', '/api/v1/auth/login', { email: 'fdiomande@ivoire-distribution.ci', password: 'Demo2026!' })
  const su = await call(exp, 'POST', '/api/v1/auth/2fa/setup')
  const suBody = (await su.json().catch(() => ({}))) as { secret?: string }
  const en = await call(exp, 'POST', '/api/v1/auth/2fa/enable', { code: totp(suBody.secret ?? '') })
  check('comptable enrôlé 2FA avant exports (vague 2 active)', su.status === 200 && en.status === 200)
  for (const type of ['balance', 'grandlivre', 'journal']) {
    for (const format of ['pdf', 'xlsx']) {
      const res = await fetch(`${BASE}/api/v1/finance/export?type=${type}&format=${format}&from=2025-01-01&to=2026-12-31`, {
        headers: { cookie: exp.cookie ?? '' },
      })
      const buf = Buffer.from(await res.arrayBuffer())
      const magic = format === 'pdf' ? '%PDF' : 'PK'
      const ok = res.status === 200 && buf.subarray(0, 4).toString('latin1').startsWith(magic) && buf.length > 1000
      check(`export ${type}.${format} → ${res.status}, ${buf.length} octets, signature ${magic}`, ok, `status=${res.status}`)
    }
  }
  // accès refusé sans auth
  const anon = await fetch(`${BASE}/api/v1/finance/export?type=balance&format=pdf`)
  check('export sans session → 401', anon.status === 401)

  console.log('\n━━━ ④ NETTOYAGE — état démo neutre ━━━')
  // Les tests viennent d'enrôler comptable ET CFO : on désactive la 2FA des deux
  // (mot de passe requis) pour restaurer l'état de démonstration d'origine.
  const dis1 = await call(exp, 'POST', '/api/v1/auth/2fa/disable', { password: 'Demo2026!' })
  check('fdiomande : 2FA désactivée après tests', dis1.status === 200)
  const cfo9: Jar = {}
  const cfoLogin = await call(cfo9, 'POST', '/api/v1/auth/login', { email: 'icoulibaly@ivoire-distribution.ci', password: 'Demo2026!' })
  const cfoLoginBody = (await cfoLogin.json().catch(() => ({}))) as { mfaRequired?: boolean; challenge?: string }
  if (cfoLoginBody.mfaRequired && cfoLoginBody.challenge) {
    // Le CFO a été enrôlé par la section ② de CE run — le secret est connu :
    // vérification TOTP puis désactivation pour restaurer l'état démo.
    await call(cfo9, 'POST', '/api/v1/auth/2fa/verify', { challenge: cfoLoginBody.challenge, code: totp(secret) })
    const dis2 = await call(cfo9, 'POST', '/api/v1/auth/2fa/disable', { password: 'Demo2026!' })
    check('icoulibaly (CFO) : 2FA désactivée après tests', dis2.status === 200)
  } else {
    const dis2 = await call(cfo9, 'POST', '/api/v1/auth/2fa/disable', { password: 'Demo2026!' })
    check('icoulibaly (CFO) : 2FA désactivée après tests', dis2.status === 200)
  }

  console.log(`\n━━━ RÉSULTAT : ${pass} PASS / ${fail} FAIL ━━━`)
  if (fails.length) console.log('Échecs : ' + fails.join(' · '))
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('CRASH:', e)
  process.exit(2)
})
