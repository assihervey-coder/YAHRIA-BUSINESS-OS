// YAHRIA BUSINESS OS V1 — Tests d'intégration ITERATION 5
// ① Robustesse client : erreur API ≠ données (vérifiée côté contrats API : 401/403 portent
//    toujours {error, code?} — la couche apiJson() côté front les transforme en états d'erreur)
// ② Verrouillage 2FA progressif par VAGUES : wave 2 (ADMIN, ACCOUNTANT) + wave 3 (OPS, AUDITOR)
// ③ Enrôlement = clé de déblocage ; nettoyage complet en fin de run (état démo neutre)
import { createHmac } from 'node:crypto'

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

// TOTP RFC 6238 (HMAC-SHA1, 30 s, 6 chiffres)
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

const PW = 'Demo2026!'

/** Login + attente d'un corps JSON typé. */
async function login(jar: Jar, email: string) {
  const r = await call(jar, 'POST', '/api/v1/auth/login', { email, password: PW })
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> }
}

async function disable2fa(jar: Jar) {
  const r = await call(jar, 'POST', '/api/v1/auth/2fa/disable', { password: PW })
  return r.status
}

async function main() {
  console.log('\n━━━ ① VERROU PAR VAGUES — chaque rôle non enrôlé est bloqué ━━━')

  const subjects: { email: string; role: string; wave: number }[] = [
    { email: 'fdiomande@ivoire-distribution.ci', role: 'ACCOUNTANT', wave: 2 },
    { email: 'ykouassi@ivoire-distribution.ci', role: 'OPS', wave: 3 },
    { email: 'auditeur@yahria.africa', role: 'AUDITOR', wave: 3 },
  ]

  for (const s of subjects) {
    const jar: Jar = {}
    const { status, body } = await login(jar, s.email)
    check(`login ${s.role} (vague ${s.wave}, non enrôlé) → 200`, status === 200, `status=${status} ${JSON.stringify(body).slice(0, 80)}`)

    const me = await call(jar, 'GET', '/api/v1/auth/me')
    const meBody = (await me.json().catch(() => ({}))) as { user?: { mfaRequired?: boolean; totpEnabled?: boolean } }
    check(`${s.role} : me.mfaRequired=true (whitelist auth ouverte)`, me.status === 200 && meBody.user?.mfaRequired === true && meBody.user?.totpEnabled === false)

    const dash = await call(jar, 'GET', '/api/v1/dashboard')
    const dashBody = (await dash.json().catch(() => ({}))) as { code?: string; kpis?: unknown }
    check(`${s.role} : API métier verrouillée (403 MFA_ENROLLMENT_REQUIRED)`, dash.status === 403 && dashBody.code === 'MFA_ENROLLMENT_REQUIRED' && dashBody.kpis === undefined, `status=${dash.status} body=${JSON.stringify(dashBody).slice(0, 90)}`)

    const sess = await call(jar, 'GET', '/api/v1/auth/sessions')
    check(`${s.role} : /auth/sessions reste ouvert (whitelist)`, sess.status === 200)

    if (s.role === 'OPS') {
      const g = await call(jar, 'GET', '/api/v1/governance')
      check('OPS : /governance verrouillée également (verrou indépendant des permissions)', g.status === 403)
    }
  }

  console.log('\n━━━ ② ENRÔLEMENT = CLÉ DE DÉBLOCAGE (ACCOUNTANT, vague 2) ━━━')

  const acc: Jar = {}
  await login(acc, 'fdiomande@ivoire-distribution.ci')

  // setup → secret + QR
  let r = await call(acc, 'POST', '/api/v1/auth/2fa/setup')
  let d = (await r.json().catch(() => ({}))) as { secret?: string; qrDataUrl?: string; otpauth?: string }
  check('setup 2FA → 200 + secret + QR data-url', r.status === 200 && !!d.secret && (d.qrDataUrl ?? '').startsWith('data:image/'))

  // enable avec code TOTP
  r = await call(acc, 'POST', '/api/v1/auth/2fa/enable', { code: totp(d.secret!) })
  const enableBody = (await r.json().catch(() => ({}))) as { recoveryCodes?: string[] }
  check('enable 2FA → 200 + 8 codes de récupération', r.status === 200 && (enableBody.recoveryCodes ?? []).length === 8, `status=${r.status}`)

  // l'API métier est débloquée SANS re-login (mfaRequired recalculé par session)
  r = await call(acc, 'GET', '/api/v1/dashboard')
  const dashOk = (await r.json().catch(() => ({}))) as { kpis?: { treasury?: number } }
  check('dashboard → 200 avec kpis.treasury défini (déblocage immédiat)', r.status === 200 && typeof dashOk.kpis?.treasury === 'number', `status=${r.status}`)

  // re-login → défi TOTP en 2 étapes
  const acc2: Jar = {}
  const second = await login(acc2, 'fdiomande@ivoire-distribution.ci')
  check('re-login ACCOUNTANT enrôlé → défi 2FA (mfaRequired+challenge)', second.status === 200 && second.body.mfaRequired === true && typeof second.body.challenge === 'string')
  r = await call(acc2, 'POST', '/api/v1/auth/2fa/verify', { challenge: second.body.challenge, code: totp(d.secret!, 0) })
  const vBody = (await r.json().catch(() => ({}))) as Record<string, unknown>
  check('vérification TOTP → 200 (session émise)', r.status === 200, `status=${r.status} ${JSON.stringify(vBody).slice(0, 80)}`)
  r = await call(acc2, 'GET', '/api/v1/auth/me')
  const meBody = (await r.json().catch(() => ({}))) as { user?: { totpEnabled?: boolean } }
  check('session post-TOTP pleinement active (mfaRequired=false)', r.status === 200 && meBody.user?.totpEnabled === true)

  console.log('\n━━━ ③ 401 GLOBALE — révolution de session → corps {error} propre ━━━')
  // Le front (apiJson) transforme toute 401 en redirection /login — on vérifie
  // ici que l'API émet bien un corps JSON {error} et jamais des données métier.
  const dead: Jar = {}
  await login(dead, 'ykouassi@ivoire-distribution.ci')
  await call(dead, 'POST', '/api/v1/auth/logout')
  r = await call(dead, 'GET', '/api/v1/dashboard')
  d = (await r.json().catch(() => ({}))) as Record<string, unknown>
  check('dashboard après logout → 401 {error} sans kpis', r.status === 401 && typeof d.error === 'string' && d.kpis === undefined)

  console.log('\n━━━ ④ NETTOYAGE — état démo neutre (2FA désactivée) ━━━')
  const st1 = await disable2fa(acc2)
  check('fdiomande : 2FA désactivée (état démo restauré)', st1 === 200, `status=${st1}`)
  // icoulibaly (CFO) était resté enrôlé par le run itération 4 — restauration
  const cfo: Jar = {}
  const cfoLogin = await login(cfo, 'icoulibaly@ivoire-distribution.ci')
  if (cfoLogin.body.mfaRequired === true && typeof cfoLogin.body.challenge === 'string') {
    console.log('  ℹ️  CFO encore enrôlé (héritage itération 4) — impossible de désactiver sans le secret TOTP ; état laissé tel quel.')
  } else {
    const st2 = await disable2fa(cfo)
    // 200 = désactivée maintenant · 403 MFA_ENROLLMENT_REQUIRED = déjà désactivée
    // (le verrou PAR CONSTRUCTION refuse /2fa/disable à un compte non enrôlé —
    //  l'objectif de restauration est déjà atteint). Vérification d'état réel via /me.
    const meR = await call(cfo, 'GET', '/api/v1/auth/me')
    const meB = (await meR.json().catch(() => ({}))) as { user?: { totpEnabled?: boolean } }
    check(
      'icoulibaly (CFO) : état démo restauré (2FA désactivée)',
      meB.user?.totpEnabled === false && (st2 === 200 || st2 === 403),
      `disable=${st2}`
    )
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`RÉSULTAT : ${pass} PASS · ${fail} FAIL`)
  if (fails.length) {
    console.log('Échecs :')
    for (const f of fails) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Test crashé :', e)
  process.exit(1)
})
