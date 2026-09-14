// Captures d'écran de contrôle visuel du site vitrine
const { chromium } = require('playwright')
const BASE = 'http://localhost:3000'
const OUT = '/home/z/my-project/scripts'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(30000)

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/vitrine_accueil.png`, fullPage: false })
  await page.goto(`${BASE}/annonces`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/vitrine_annonces.png`, fullPage: false })
  await page.goto(`${BASE}/contacts`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}/vitrine_contacts.png`, fullPage: false })
  // footer sticky check : page courte (securite) et longue (fonctionnalites)
  await page.goto(`${BASE}/securite`, { waitUntil: 'networkidle' })
  const footer = page.locator('footer')
  const inView = await footer.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.bottom <= window.innerHeight + 2
  })
  console.log('footer visible sans scroll (page courte):', inView)
  await page.screenshot({ path: `${OUT}/vitrine_securite.png`, fullPage: false })
  await browser.close()
  console.log('screenshots ok')
}
main().catch((e) => { console.error(e); process.exit(1) })
