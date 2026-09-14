// YAHRIA BUSINESS OS V1 — Vérification navigateur ITERATION 5 (Playwright)
// ① Crash cockpit corrigé : login rôle non enrôlé → mur MFA SÉCURITÉ rendu, zéro TypeError
// ② Mur structurel : les autres vues (Money…) restent inaccessibles tant que la 2FA n'est pas enrôlée
// ③ Enrôlement via UI (QR + code TOTP calculé) → Cockpit charge les KPI (plus de crash « treasury »)
// ④ Mort de session (logout serveur) → 401 → redirection automatique /login (jamais d'écran cassé)
const { chromium } = require('playwright')
const { createHmac } = require('node:crypto')
const { execSync } = require('node:child_process')

const BASE = 'http://localhost:3000'
const shots = '/home/z/my-project/scripts'

/** Pré-nettoyage : l'état 2FA du compte de test est remis à zéro pour rendre le
 *  test déterministe, même si un run précédent a crashé en cours d'enrôlement. */
function resetAccount2fa(email) {
  execSync(
    `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.update({where:{email:'${email}'},data:{totpSecret:null,totpEnabledAt:null,recoveryCodes:null}}).then(()=>p.\\$disconnect()).catch(e=>{console.error(e.message);process.exit(1)})"`,
    { cwd: '/home/z/my-project', stdio: 'pipe' }
  )
}
let pass = 0
let fail = 0
const fails = []
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; fails.push(name); console.log(`  ❌ ${name} ${detail ? `— ${detail}` : ''}`) }
}

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
function totp(secret, driftSteps = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + driftSteps
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const o = h[h.length - 1] & 0xf
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 1000000).padStart(6, '0')
}

async function main() {
  resetAccount2fa('fdiomande@ivoire-distribution.ci')
  resetAccount2fa('icoulibaly@ivoire-distribution.ci')

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    // on ignore le bruit réseau des 401 volontaires du test (ressource refusée)
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  let mfaSecret = null
  page.on('response', async (res) => {
    if (res.url().includes('/api/v1/auth/2fa/setup') && res.request().method() === 'POST') {
      try { mfaSecret = (await res.json()).secret } catch { /* noop */ }
    }
  })

  // ── ① redirection anonyme → login ──────────────────────────────
  console.log('\n━━━ ① ANONYME → /login ━━━')
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {})
  check('anonyme redirigé vers /login', new URL(page.url()).pathname === '/login', `url=${page.url()}`)

  // ── ② mur MFA pour ACCOUNTANT (vague 2) — le crash cockpit est l'objet du test ──
  console.log('\n━━━ ② MUR MFA (ACCOUNTANT non enrôlé) ━━━')
  await page.fill('input[type=email]', 'fdiomande@ivoire-distribution.ci')
  await page.fill('input[type=password]', 'Demo2026!')
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })
  await page.waitForTimeout(1800)
  const bannerVisible = await page.getByText('exige la double authentification').isVisible().catch(() => false)
  const wallCard = await page.getByText('Double authentification requise — accès applicatif verrouillé').isVisible().catch(() => false)
  const cockpitCrashed = await page.getByText('Trésorerie totale').isVisible().catch(() => false)
  check('mur MFA affiché (bannière ambre + carte verrou)', bannerVisible && wallCard)
  check('cockpit NON rendu derrière le mur (aucun KPI visible)', !cockpitCrashed)

  // tentative de fuite par la nav → le mur tient
  await page.getByRole('button', { name: /Money/ }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  const moneyLeak = await page.getByText('MONEY — couche financière transactionnelle').isVisible().catch(() => false)
  check('nav Money bloquée par le mur structurel (vue Sécurité forcée)', !moneyLeak)
  await page.screenshot({ path: `${shots}/i5_wall.png` })

  // ── ③ enrôlement via UI → déblocage ────────────────────────────
  console.log('\n━━━ ③ ENRÔLEMENT UI (QR + TOTP) ━━━')
  await page.getByRole('button', { name: /Configurer la 2FA/ }).click()
  await page.waitForTimeout(1500)
  const qrVisible = await page.locator('img[alt="QR code d\'enrôlement TOTP"]').isVisible().catch(() => false)
  check('QR d\u2019enrôlement affiché', qrVisible)
  check('secret intercepté depuis la réponse setup', !!mfaSecret)
  await page.screenshot({ path: `${shots}/i5_enroll.png` })
  await page.locator('input[placeholder="123456"]').fill(totp(mfaSecret))
  const enableRes = page.waitForResponse((r) => r.url().includes('/api/v1/auth/2fa/enable'), { timeout: 15000 })
  await page.getByRole('button', { name: /Vérifier & activer/ }).click()
  const en = await enableRes
  console.log(`  ℹ️  enable → ${en.status()}`)
  const recBtn = page.getByRole('button', { name: /bien noté ces codes/ })
  try {
    await recBtn.waitFor({ timeout: 15000 })
    await recBtn.click()
    check('codes de récupération présentés (activation OK)', true)
  } catch {
    await page.screenshot({ path: `${shots}/i5_debug_dialog.png` })
    const btns = await page.locator('button').allTextContents().catch(() => [])
    console.log('  ⚠️ boutons visibles :', JSON.stringify(btns.slice(0, 15)))
    check('codes de récupération présentés (activation OK)', false, 'bouton introuvable — voir i5_debug_dialog.png')
  }
  await page.waitForTimeout(1500)
  const bannerGone = !(await page.getByText('exige la double authentification').isVisible().catch(() => false))
  check('mur levé après enrôlement (bannière disparue)', bannerGone)

  // Cockpit charge : le bug « Cannot read properties of undefined (reading treasury) » est corrigé
  await page.getByRole('button', { name: /Cockpit/ }).first().click()
  await page.getByText('Trésorerie totale').waitFor({ timeout: 15000 })
  check('Cockpit rendu avec KPI « Trésorerie totale » — crash corrigé', true)
  await page.screenshot({ path: `${shots}/i5_cockpit_ok.png` })

  // ── ④ mort de session → redirection /login ─────────────────────
  console.log('\n━━━ ④ MORT DE SESSION → /login ━━━')
  const cookies = await context.cookies()
  const sess = cookies.find((c) => c.name === 'yahria_session')
  check('cookie de session présent', !!sess)
  const res = await fetch(`${BASE}/api/v1/auth/logout`, { method: 'POST', headers: { cookie: `yahria_session=${sess.value}` } })
  check('logout serveur (depuis Node) → 200', res.status === 200)
  await page.getByRole('button', { name: /Money/ }).first().click()
  await page.waitForURL(`${BASE}/login`, { timeout: 15000 })
  check('401 → redirection automatique vers /login (jamais d\u2019écran cassé)', page.url().endsWith('/login'))
  await page.screenshot({ path: `${shots}/i5_redirect.png` })

  // ── ⑤ zéro erreur JS applicative ──────────────────────────────
  console.log('\n━━━ ⑤ CONSOLE ━━━')
  check('zéro erreur JS applicative (pageerror/console.error)', errors.length === 0, errors.slice(0, 3).join(' | '))

  await browser.close()

  // ── ⑥ nettoyage : 2FA désactivée pour l'état démo ──────────────
  console.log('\n━━━ ⑥ NETTOYAGE ÉTAT DÉMO ━━━')
  const l = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fdiomande@ivoire-distribution.ci', password: 'Demo2026!' }) })
  const lb = await l.json()
  if (lb.mfaRequired && lb.challenge) {
    const v = await fetch(`${BASE}/api/v1/auth/2fa/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: lb.challenge, code: totp(mfaSecret) }) })
    const setCookie = v.headers.get('set-cookie')
    const cookie = setCookie?.split(';')[0]
    const dis = await fetch(`${BASE}/api/v1/auth/2fa/disable`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ password: 'Demo2026!' }) })
    check('fdiomande : 2FA désactivée (état démo restauré)', dis.status === 200, `status=${dis.status}`)
  } else {
    check('fdiomande : déjà non enrôlé', true)
  }

  console.log(`\nRÉSULTAT : ${pass} PASS · ${fail} FAIL`)
  if (fails.length) { console.log('Échecs :'); for (const f of fails) console.log(`  - ${f}`); process.exit(1) }
}

main().catch((e) => { console.error('Test crashé :', e); process.exit(1) })
