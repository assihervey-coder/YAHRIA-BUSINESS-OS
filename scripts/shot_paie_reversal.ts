// YAHRIA — capture UI : onglet Paie avec contre-passation REVERSED + boutons bulletin PDF
// Flow de connexion copié du harnais iter6 (mur MFA, enrôlement assist).
// Usage : npx tsx scripts/shot_paie_reversal.ts
import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await page.fill('input[type=email]', 'akone@ivoire-distribution.ci')
  await page.fill('input[type=password]', 'Demo2026!')
  await page.click('button[type=submit]')
  await page.waitForTimeout(2000)

  // Passerelle MFA (assist) : défi déjà enrôlé → vérifier ; sinon enrôlement assist
  if (await page.locator('text=Vérifier et se connecter').count()) {
    await page.click('text=Vérifier et se connecter')
  } else if (await page.locator('text=Vérifier & activer').count()) {
    await page.click('text=Vérifier & activer')
    await page.waitForTimeout(1200)
    await page.click('text=J\'ai noté mes codes — Accéder à la plateforme')
  }
  await page.waitForTimeout(2500)

  await page.click('nav >> text=Finance')
  await page.waitForTimeout(1500)
  await page.click('[role=tab]:has-text("Paie")')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'scripts/i16_paie_liste.png' })

  // Détail du run REVERSED (2026-08)
  const rowRev = page.locator('tr', { hasText: 'REVERSED' }).first()
  await rowRev.click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/i16_paie_reversed.png' })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  // Détail du run POSTED 2026-07 (CTA contre-passation guidée)
  const row07 = page.locator('tr', { hasText: '2026-07' }).first()
  await row07.click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/i16_paie_reversal_cta.png' })

  await browser.close()
  console.log('screenshots OK')
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
