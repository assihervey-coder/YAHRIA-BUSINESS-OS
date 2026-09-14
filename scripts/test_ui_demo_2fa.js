// YAHRIA BUSINESS OS V1 — Vérification navigateur PARCOURS « 2FA AVANT PLATEFORME » (Playwright)
// Parcours exigé : validation du login → validation 2FA (TOTP ou activation) → SEULEMENT
// ENSUITE connexion à la plateforme /app. Aucune navigation vers /app avant 2FA validée.
// ① Anonymous /2fa/demo-code → 401 (jamais public)
// ② Login OWNER non enrôlé (API) → réponse mfaEnrollmentRequired=true + session provisionnelle :
//    /app reste muré (défense en profondeur) + API métier 403 MFA_ENROLLMENT_REQUIRED
// ③ Porte d'enrôlement SUR /login : QR affiché, code démo auto-rempli, URL reste /login
// ④ « Vérifier & activer » → 8 codes de récupération → « Accéder à la plateforme » → /app Cockpit
// ⑤ demo-code authentifié → 200
// ⑥ Logout → re-login (compte enrôlé) → étape 2 « MODE DÉMO — CODE ACTUEL » auto-remplie → /app
// ⑦ Reset : état final démo = 0 compte enrôlé
const { chromium } = require('playwright')
const { execSync } = require('node:child_process')

const BASE = 'http://localhost:3000'
const OWNER = 'akone@ivoire-distribution.ci'
const DEMO_PASSWORD = 'Demo2026!'

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

async function main() {
  resetAccount2fa(OWNER)

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.setDefaultTimeout(30000)

  // ── ① Route demo-code jamais publique ──
  console.log('\n① API — garde de la route demo-code')
  const anon = await page.request.post(`${BASE}/api/v1/auth/2fa/demo-code`)
  check('anonyme → 401', anon.status() === 401, `status=${anon.status()}`)

  // ── ② Session provisionnelle : réponse login + mur serveur intact ──
  console.log('\n② Login OWNER non enrôlé (API) → mfaEnrollmentRequired + verrous serveur')
  const loginResp = await page.request.post(`${BASE}/api/v1/auth/login`, {
    data: { email: OWNER, password: DEMO_PASSWORD },
  })
  const loginBody = await loginResp.json().catch(() => ({}))
  check('login → 200 + ok', loginResp.status() === 200 && loginBody.ok === true, `status=${loginResp.status()}`)
  check('réponse mfaEnrollmentRequired=true', loginBody.mfaEnrollmentRequired === true, `got=${JSON.stringify(loginBody.mfaEnrollmentRequired)}`)
  check('cookie de session provisionnelle émis', (await page.context().cookies(BASE)).some((c) => c.name === 'yahria_session'))

  const biz = await page.request.get(`${BASE}/api/v1/agents/approvals`)
  const bizBody = await biz.json().catch(() => ({}))
  check('API métier → 403 MFA_ENROLLMENT_REQUIRED', biz.status() === 403 && bizBody.code === 'MFA_ENROLLMENT_REQUIRED', `status=${biz.status()} code=${bizBody.code}`)

  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Accès restreint : votre rôle', { timeout: 30000 })
  check('défense en profondeur : /app muré (Accès restreint)', true)
  const wallView = await page.waitForSelector('text=Configurer la 2FA', { timeout: 30000 })
  check('vue Sécurité forcée (fallback enrôlement in-app)', !!wallView)

  // ── ③ Porte d'enrôlement sur /login — JAMAIS de navigation vers /app ──
  console.log('\n③ Porte d\'enrôlement 2FA sur /login (mode démo assisté)')
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const chip = page.locator('button', { hasText: OWNER }).first()
  await chip.click()
  await page.waitForSelector('img[alt="QR code d\'enrôlement TOTP"]', { timeout: 30000 })
  check('QR d\'enrôlement affiché SUR LA PAGE DE CONNEXION', true)
  check('URL reste /login (aucune navigation plateforme)', page.url().startsWith(`${BASE}/login`), `url=${page.url()}`)
  check('pas de KPI plateforme rendu', (await page.locator('text=Trésorerie totale').count()) === 0)

  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="123456"]')
    return el && el.value.length === 6
  })
  const filled = await page.inputValue('input[placeholder="123456"]')
  check('code TOTP auto-rempli (assist démo, 6 chiffres)', /^\d{6}$/.test(filled), `value=${filled}`)
  const hint = await page.locator('text=MODE DÉMO — CODE ACTUEL').count()
  check('encart « MODE DÉMO — CODE ACTUEL » + compte à rebours', hint > 0)

  // Fraîcheur du code juste avant l'activation (rotation TOTP 30 s)
  await page.click('text=Nouveau code (démo)')
  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="123456"]')
    return el && /^\d{6}$/.test(el.value)
  })

  // ── ④ Activation → codes de récupération → ENTRÉE plateforme ──
  console.log('\n④ Activation 2FA → codes de récupération → entrée plateforme')
  await page.click('text=Vérifier & activer')
  await page.waitForSelector('text=Codes de récupération — à conserver')
  const codes = await page.locator('.grid.grid-cols-2 span').count()
  check('8 codes de récupération affichés', codes === 8, `trouvés=${codes}`)
  await page.click('text=J\'ai noté mes codes — Accéder à la plateforme')
  await page.waitForURL(`${BASE}/app`, { timeout: 30000 })
  await page.waitForSelector('text=Trésorerie totale', { timeout: 30000 })
  check('2FA validée → plateforme /app accessible (Cockpit KPI)', true)
  check('mur absent après validation', (await page.locator('text=Accès restreint : votre rôle').count()) === 0)

  // ── ⑤ demo-code authentifié ──
  console.log('\n⑤ API demo-code authentifiée')
  const meRoute = await page.request.post(`${BASE}/api/v1/auth/2fa/demo-code`)
  const meBody = await meRoute.json().catch(() => ({}))
  check('authentifié → 200 {code 6 chiffres}', meRoute.status() === 200 && /^\d{6}$/.test(meBody.code ?? ''), `status=${meRoute.status()}`)
  check('remainingSec présent (0-30)', Number.isInteger(meBody.remainingSec) && meBody.remainingSec >= 0 && meBody.remainingSec <= 30)

  // ── ⑥ Re-login — compte enrôlé : étape 2 TOTP AVANT la plateforme ──
  console.log('\n⑥ Re-login enrôlé — étape 2 TOTP en mode démo')
  await page.locator('button[title="Déconnexion"]').click()
  await page.waitForURL(/\/login/)
  const chip2 = page.locator('button', { hasText: OWNER }).first()
  await chip2.click()
  await page.waitForSelector('text=MODE DÉMO — CODE ACTUEL', { timeout: 30000 })
  check('encart « MODE DÉMO — CODE ACTUEL » affiché (étape 2)', true)
  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="123456 ou AB12-CD34"]')
    return el && el.value.length === 6
  })
  const code2 = await page.inputValue('input[placeholder="123456 ou AB12-CD34"]')
  check('étape 2 : code auto-rempli', /^\d{6}$/.test(code2), `value=${code2}`)
  await page.click('text=Vérifier et se connecter')
  await page.waitForURL(`${BASE}/app`, { timeout: 30000 })
  await page.waitForSelector('text=Trésorerie totale', { timeout: 30000 })
  check('connexion 2 étapes (TOTP démo) → Cockpit OK', true)

  // ── ⑦ Reset état démo propre ──
  console.log('\n⑦ Reset — retour à 0 compte enrôlé')
  const dis = await page.evaluate(async (pw) => {
    const r = await fetch('/api/v1/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    return r.status
  }, DEMO_PASSWORD)
  check('désactivation 2FA → 200', dis === 200, `status=${dis}`)

  await browser.close()
  // Contrôle scopé au compte manipulé par CE test (les autres comptes peuvent
  // être enrôlés volontairement — manuellement ou par d'autres itérations).
  const remaining = execSync(
    `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findUnique({where:{email:'${OWNER}'},select:{totpEnabledAt:true}}).then(u=>{console.log(u&&u.totpEnabledAt?'ENROLLED':'CLEAN');return p.\\$disconnect()})"`,
    { cwd: '/home/z/my-project', encoding: 'utf8' }
  ).trim()
  check('état final : OWNER désenrôlé (démo vierge)', remaining === 'CLEAN', `state=${remaining}`)

  check('zéro erreur console/page', errors.length === 0, errors.slice(0, 3).join(' | '))

  console.log(`\n═══ RÉSULTAT : ${pass} PASS / ${fail} FAIL ═══`)
  if (fail) { console.log('Échecs : ' + fails.join(' · ')); process.exit(1) }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
