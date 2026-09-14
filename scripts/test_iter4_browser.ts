// YAHRIA BUSINESS OS V1 — Vérification navigateur ITERATION 4 (Playwright)
// 1. Page login → capture
// 2. Login OPS → panneau Sécurité (sessions actives) → capture
// 3. Enrôlement 2FA (QR visible) → capture
// 4. Finance → onglet Export SYSCOHADA → capture
import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const shots = '/home/z/my-project/scripts'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  // 1. page de login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${shots}/i4_login.png` })
  console.log('✓ login page capturée')

  // 2. connexion OPS (ykouassi)
  await page.fill('input[type=email]', 'ykouassi@ivoire-distribution.ci')
  await page.fill('input[type=password]', 'Demo2026!')
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })
  await page.waitForTimeout(1500)

  // 3. panneau Sécurité
  await page.click('nav >> text=Sécurité')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${shots}/i4_security.png` })
  console.log('✓ panneau sécurité capturé')

  // 4. enrôlement 2FA (QR)
  await page.click('text=Configurer la 2FA')
  await page.waitForSelector('img[alt*="QR"]', { timeout: 10000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${shots}/i4_2fa_qr.png` })
  console.log('✓ enrôlement 2FA (QR) capturé — secret généré, annulation')
  await page.click('text=Annuler')

  // 5. Finance → Export SYSCOHADA
  await page.click('nav >> text=Finance')
  await page.waitForTimeout(1200)
  await page.click('text=Export SYSCOHADA')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${shots}/i4_export.png` })
  console.log('✓ onglet Export SYSCOHADA capturé')

  // 6. vérifie que les download buttons sont actifs
  const pdfBtn = await page.isEnabled('button:has-text("Télécharger PDF")')
  const xlsBtn = await page.isEnabled('button:has-text("Télécharger Excel")')
  console.log(`✓ boutons export actifs : PDF=${pdfBtn} Excel=${xlsBtn}`)

  const realErrors = errors.filter((e) => !/favicon|hydration|Warning/i.test(e))
  console.log(realErrors.length ? `⚠ erreurs console : ${realErrors.slice(0, 3).join(' | ')}` : '✓ aucune erreur console')
  await browser.close()
  process.exit(realErrors.length ? 1 : 0)
}

main().catch((e) => { console.error('CRASH', e); process.exit(2) })
