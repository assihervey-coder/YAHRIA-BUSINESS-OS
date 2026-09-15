/* eslint-disable @typescript-eslint/no-require-imports */
// YAHRIA BUSINESS OS V1 — Vérification navigateur « Export SYSCOHADA » (Playwright)
// Parcours : vitrine → /login → passerelle 2FA (enrôlement assisté démo) → /app
// → Finance (02 — OHADA SYSCOHADA) → onglet Export SYSCOHADA → téléchargements
// PDF et Excel réels (vérification statut HTTP, type MIME, taille, toast).
// Nettoyage : OWNER désenrôlé en fin de run (état démo neutre).
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
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  resetAccount2fa(OWNER)

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.setDefaultTimeout(30000)

  // ── ① Passerelle de connexion : password → enrôlement 2FA → plateforme ──
  console.log('\n① Passerelle /login — enrôlement 2FA avant la plateforme')
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('button', { hasText: OWNER }).first().click()
  await page.waitForSelector('img[alt="QR code d\'enrôlement TOTP"]', { timeout: 30000 })
  check('QR d\'enrôlement affiché sur la page de connexion', true)
  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="123456"]')
    return el && /^\d{6}$/.test(el.value)
  })
  check('code TOTP démo auto-rempli (assist)', true)
  await page.click('text=Vérifier & activer')
  await page.waitForSelector('text=Codes de récupération — à conserver')
  await page.click('text=J\'ai noté mes codes — Accéder à la plateforme')
  await page.waitForURL(`${BASE}/app`, { timeout: 30000 })
  await page.waitForSelector('text=Trésorerie totale', { timeout: 30000 })
  check('2FA validée → /app Cockpit accessible', true)

  // ── ② Finance — vue 02 — OHADA SYSCOHADA ──
  console.log('\n② Navigation Finance (02 — OHADA SYSCOHADA)')
  await page.locator('aside button', { hasText: 'Finance' }).first().click()
  await page.waitForSelector('text=Facturation TVA 18 %', { timeout: 30000 })
  check('vue Finance rendue (Factures / Dépenses / Comptabilité / Export)', true)
  await page.getByRole('tab', { name: 'Export SYSCOHADA' }).click()
  await page.waitForSelector('text=États financiers SYSCOHADA — système normal', { timeout: 15000 })
  check('panneau « Export SYSCOHADA » ouvert (période + document + formats)', true)

  // ── ③ Téléchargement PDF réel ──
  console.log('\n③ Téléchargement PDF — balance générale')
  const pdfHits = []
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/finance/export')) {
      pdfHits.push({ status: r.status(), ct: r.headers()['content-type'] ?? '' })
    }
  })
  await page.click('text=Télécharger PDF')
  await page.waitForSelector('text=Export généré', { timeout: 30000 })
  await page.waitForTimeout(400)
  const pdfCall = pdfHits.find((h) => h.ct.includes('application/pdf'))
  check('appel API export → 200 application/pdf', !!pdfCall && pdfCall.status === 200, JSON.stringify(pdfHits))
  check('toast « Export généré » confirmé', true)

  // ── ④ Téléchargement Excel réel ──
  console.log('\n④ Téléchargement Excel — même période')
  const xlsxPromise = page.waitForResponse(
    (r) => r.url().includes('/api/v1/finance/export') && (r.headers()['content-type'] ?? '').includes('spreadsheetml'),
    { timeout: 30000 }
  )
  await page.click('text=Télécharger Excel')
  const xlsxCall2 = await xlsxPromise
  check('appel API export → 200 xlsx (OpenXML)', xlsxCall2.status() === 200, `status=${xlsxCall2.status()}`)
  // Le corps réseau est consommé par la page (res.blob()) : on re-télécharge via
  // context.request (cookies partagés) pour valider les octets réellement servis.
  const xlsxUrl = new URL(xlsxCall2.url()).pathname + '?' + new URL(xlsxCall2.url()).search
  const xlsxApi = await context.request.get(`${BASE}${xlsxUrl}`)
  const buf = await xlsxApi.body()
  check('corps XLSX valide (signature PK, > 2 Ko)', buf.subarray(0, 2).toString('latin1') === 'PK' && buf.length > 2000, `${buf.length} octets`)

  // ── ⑤ Grand livre via l'UI (changement de document dans le Select) ──
  console.log('\n⑤ Grand livre lettré via l\'UI')
  await page.locator('[role="combobox"]').click()
  await page.click('text=Grand livre lettré')
  const glPromise = page.waitForResponse(
    (r) => r.url().includes('type=grandlivre') && (r.headers()['content-type'] ?? '').includes('application/pdf'),
    { timeout: 30000 }
  )
  await page.click('text=Télécharger PDF')
  const glResp2 = await glPromise
  check('export grandlivre.pdf → 200 application/pdf', glResp2.status() === 200, `status=${glResp2.status()}`)
  const glUrl = new URL(glResp2.url()).pathname + '?' + new URL(glResp2.url()).search
  const glApi = await context.request.get(`${BASE}${glUrl}`)
  const glBuf = await glApi.body()
  check('corps PDF valide (signature %PDF, > 2 Ko)', glBuf.subarray(0, 4).toString('latin1') === '%PDF' && glBuf.length > 2000, `${glBuf.length} octets`)

  // Capture d'écran de preuve
  await page.screenshot({ path: '/home/z/my-project/scripts/i6_export_syscohada.png', fullPage: false })
  check('capture d\'écran i6_export_syscohada.png', true)

  // ── ⑥ Nettoyage — état démo neutre ──
  console.log('\n⑥ Nettoyage — OWNER désenrôlé')
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
    `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findUnique({where:{email:'${OWNER}'},select:{totpEnabledAt:true}}).then(u=>{console.log(u&&u.totpEnabledAt?'ENROLLED':'CLEAN');return p.\\$disconnect()})"`,
    { cwd: '/home/z/my-project', encoding: 'utf8' }
  ).trim()
  check('état final : OWNER désenrôlé (démo vierge)', remaining === 'CLEAN', `state=${remaining}`)

  check('zéro erreur console/page', errors.length === 0, errors.slice(0, 3).join(' | '))

  console.log(`\n═══ RÉSULTAT : ${pass} PASS / ${fail} FAIL ═══`)
  if (fail) { console.log('Échecs : ' + fails.join(' · ')); process.exit(1) }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
