// YAHRIA BUSINESS OS V1 — Vérification navigateur MODE DÉMO 2FA (Playwright)
// ① Anonymous /2fa/demo-code → 401 (jamais public)
// ② Login OWNER non enrôlé → mur MFA (Sécurité forcée)
// ③ Enrôlement assisté : « Remplir (démo) » → code TOTP courant pré-rempli → activation → codes de récupération
// ④ Mur levé → Cockpit KPI OK
// ⑤ Logout → re-login → étape 2 « MODE DÉMO — CODE ACTUEL » auto-remplie → connexion OK
// ⑥ Reset : état final démo = 0 compte enrôlé
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

  // ── ② Login OWNER → mur MFA ──
  console.log('\n② Login OWNER non enrôlé → mur MFA')
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const chip = page.locator('button', { hasText: OWNER }).first()
  await chip.click()
  await page.waitForURL(`${BASE}/`)
  await page.waitForSelector('text=Accès restreint', { timeout: 30000 })
  check('mur MFA affiché (Accès restreint)', true)
  const wallView = await page.waitForSelector('text=Configurer la 2FA', { timeout: 30000 })
  check('vue Sécurité forcée (panneau 2FA rendu)', !!wallView)

  // ── ③ Enrôlement assisté (mode démo) ──
  console.log('\n③ Enrôlement 2FA assisté — bouton « Remplir (démo) »')
  await page.click('text=Configurer la 2FA')
  await page.waitForSelector('img[alt="QR code d\'enrôlement TOTP"]')
  check('QR d\'enrôlement affiché', true)
  await page.click('text=Remplir (démo)')
  await page.waitForFunction(() => {
    const el = document.querySelector('input[inputmode="numeric"]')
    return el && el.value.length === 6
  })
  const filled = await page.inputValue('input[inputmode="numeric"]')
  check('code TOTP auto-rempli (6 chiffres)', /^\d{6}$/.test(filled), `value=${filled}`)
  const hint = await page.locator('text=Mode démo — code actuel').count()
  check('légende « Mode démo — code actuel » + compte à rebours', hint > 0)

  await page.click('text=Vérifier & activer')
  await page.waitForSelector('text=Codes de récupération — à conserver')
  const codes = await page.locator('.grid.grid-cols-2 span').count()
  check('8 codes de récupération affichés', codes === 8, `trouvés=${codes}`)
  await page.click('text=J\'ai bien noté ces codes')
  await page.waitForFunction(() => !document.body.innerText.includes('Accès restreint'))
  check('mur levé après enrôlement', true)

  // ── ④ Cockpit opérationnel ──
  console.log('\n④ Cockpit — KPI accessibles')
  await page.click('nav >> text=Cockpit')
  await page.waitForSelector('text=Trésorerie totale', { timeout: 30000 })
  const treasury = await page.locator('text=Trésorerie totale').count()
  check('KPI Trésorerie rendu (pas de crash)', treasury > 0)

  // ── ⑤ demo-code authentifié + re-login étape 2 assistée ──
  console.log('\n⑤ Re-login — étape 2 TOTP en mode démo')
  const meRoute = await page.request.post(`${BASE}/api/v1/auth/2fa/demo-code`)
  const meBody = await meRoute.json().catch(() => ({}))
  check('authentifié → 200 {code 6 chiffres}', meRoute.status() === 200 && /^\d{6}$/.test(meBody.code ?? ''), `status=${meRoute.status()}`)
  check('remainingSec présent (1-30)', Number.isInteger(meBody.remainingSec) && meBody.remainingSec >= 0 && meBody.remainingSec <= 30)

  await page.locator('button[title="Déconnexion"]').click()
  await page.waitForURL(/\/login/)
  const chip2 = page.locator('button', { hasText: OWNER }).first()
  await chip2.click()
  await page.waitForSelector('text=MODE DÉMO — CODE ACTUEL', { timeout: 30000 })
  check('encart « MODE DÉMO — CODE ACTUEL » affiché', true)
  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="123456 ou AB12-CD34"]')
    return el && el.value.length === 6
  })
  const code2 = await page.inputValue('input[placeholder="123456 ou AB12-CD34"]')
  check('étape 2 : code auto-rempli', /^\d{6}$/.test(code2), `value=${code2}`)
  await page.click('text=Vérifier et se connecter')
  await page.waitForURL(`${BASE}/`)
  await page.waitForSelector('text=Trésorerie totale', { timeout: 30000 })
  check('connexion 2 étapes (TOTP démo) → Cockpit OK', true)

  // ── ⑥ Reset état démo propre ──
  console.log('\n⑥ Reset — retour à 0 compte enrôlé')
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
  const remaining = execSync(
    `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count({where:{totpEnabledAt:{not:null}}}).then(c=>{console.log(c);return p.\\$disconnect()})"`,
    { cwd: '/home/z/my-project', encoding: 'utf8' }
  ).trim()
  check('état final : 0 compte enrôlé (démo vierge)', remaining === '0', `enrolled=${remaining}`)

  check('zéro erreur console/page', errors.length === 0, errors.slice(0, 3).join(' | '))

  console.log(`\n═══ RÉSULTAT : ${pass} PASS / ${fail} FAIL ═══`)
  if (fail) { console.log('Échecs : ' + fails.join(' · ')); process.exit(1) }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
