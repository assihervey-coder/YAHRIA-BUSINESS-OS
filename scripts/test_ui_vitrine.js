/* eslint-disable @typescript-eslint/no-require-imports */
// YAHRIA BUSINESS OS V1 — Vérification navigateur SITE VITRINE (Playwright)
// ① Les 10 pages publiques rendent leur contenu (dont /annonces et /contacts)
// ② Navigation header/footer + CTA « Accéder à la plateforme » → /login
// ③ Garde : /app sans session → redirection /login?from=/app
// ④ Formulaire de contact → POST /api/v1/contact → persistance DB ( honeypot testé )
// ⑤ Connexion depuis la vitrine → atterrissage sur /app (plateforme authentifiée)
// ⑥ Logout → /login ; lien « Retour au site vitrine » → /
const { chromium } = require('playwright')
const { execSync } = require('node:child_process')

const BASE = 'http://localhost:3000'
const OWNER = 'akone@ivoire-distribution.ci'

let pass = 0
let fail = 0
const fails = []
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; fails.push(name); console.log(`  ❌ ${name} ${detail ? `— ${detail}` : ''}`) }
}

function contactCount() {
  return Number(
    execSync(
      'node -e "const {PrismaClient}=require(\'@prisma/client\');const p=new PrismaClient();p.contactMessage.count().then(c=>{console.log(c);return p.\\$disconnect()})"',
      { cwd: '/home/z/my-project', encoding: 'utf8' }
    ).trim()
  )
}

const PAGES = [
  { href: '/', texte: "système d'exploitation" },
  { href: '/solution', texte: 'chaîne de valeur complète' },
  { href: '/fonctionnalites', texte: 'Tout ce que le système sait faire' },
  { href: '/secteurs', texte: '13 extensions sectorielles' },
  { href: '/pays', texte: 'Trois marchés nationaux' },
  { href: '/securite', texte: 'PAR CONSTRUCTION' },
  { href: '/tarifs', texte: '129 000 FCFA' },
  { href: '/annonces', texte: 'Le fil officiel de la plateforme' },
  { href: '/a-propos', texte: "infrastructure de décision" },
  { href: '/contacts', texte: 'Envoyer un message' },
]

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.setDefaultTimeout(30000)

  // ── ① Les 10 pages ──
  console.log('\n① Les 10 pages vitrine rendent leur contenu')
  for (const p of PAGES) {
    const res = await page.goto(`${BASE}${p.href}`, { waitUntil: 'networkidle' })
    const body = await page.locator('body').innerText().catch(() => '')
    const footerOk = (await page.locator('footer').count()) > 0
    const headerOk = (await page.locator('header').count()) > 0
    check(
      `${p.href} → 200 + contenu + shell`,
      res.status() === 200 && body.toLowerCase().includes(p.texte.toLowerCase()) && footerOk && headerOk,
      `status=${res.status()}`
    )
  }

  // Annonces : au moins 10 articles
  const annoncesCount = await page.goto(`${BASE}/annonces`, { waitUntil: 'networkidle' }).then(async () => (await page.locator('article').count()))
  check('/annonces : 10 annonces rendues', annoncesCount >= 10, `trouvées=${annoncesCount}`)

  // ── ② Navigation & CTA ──
  console.log('\n② Navigation header + CTA plateforme')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const navLinks = await page.locator('header nav a').count()
  check('header : 9 liens de navigation + CTA', navLinks >= 9, `liens=${navLinks}`)
  const ctaHref = await page.locator('header a', { hasText: 'Accéder à la plateforme' }).first().getAttribute('href')
  check('CTA « Accéder à la plateforme » → /login', ctaHref === '/login', `href=${ctaHref}`)
  const footerConnexion = (await page.locator('footer a[href="/login"]').count()) > 0
  check('footer : lien « Connexion plateforme »', footerConnexion)

  // ── ③ Garde /app ──
  console.log('\n③ Garde : /app sans session → /login')
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
  check('redirection vers /login?from=/app', page.url().includes('/login?from=%2Fapp'), `url=${page.url()}`)

  // ── ④ Formulaire de contact ──
  console.log('\n④ Formulaire de contact → persistance')
  const before = contactCount()
  const honeypot = await page.request.post(`${BASE}/api/v1/contact`, {
    data: { name: 'Robot Spam', email: 'bot@spam.io', subject: 'Autre', message: 'Message de robot automatisé', website: 'http://spam.io' },
  })
  const honeypotBody = await honeypot.json().catch(() => ({}))
  check('honeypot rempli → 200 factice, rien stocké', honeypot.status() === 200 && contactCount() === before, `count=${contactCount()}`)
  const bad = await page.request.post(`${BASE}/api/v1/contact`, { data: { name: 'X', email: 'invalide', subject: '', message: 'court' } })
  check('payload invalide → 400', bad.status() === 400, `status=${bad.status()}`)

  await page.goto(`${BASE}/contacts`, { waitUntil: 'networkidle' })
  await page.fill('#ct-name', 'Awa Koné')
  await page.fill('#ct-email', 'awa.kone@entreprise.ci')
  await page.fill('#ct-company', 'Ivoire Distribution SARL')
  await page.selectOption('#ct-subject', 'Demande de démonstration')
  await page.fill('#ct-message', 'Nous souhaitons une démonstration complète pour 12 utilisateurs, secteur BTP, marché ivoirien.')
  await page.click('button:has-text("Envoyer le message")')
  await page.waitForSelector('text=Message envoyé', { timeout: 30000 })
  check('formulaire soumis → confirmation « Message envoyé »', true)
  const after = contactCount()
  check('message persisté en base (+1)', after === before + 1, `before=${before} after=${after}`)

  // ── ⑤ Connexion depuis la vitrine → /app ──
  console.log('\n⑤ Authentification depuis la vitrine')
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const backLink = (await page.locator('a', { hasText: 'Retour au site vitrine' }).count()) > 0
  check('/login : lien « Retour au site vitrine »', backLink)
  const chip = page.locator('button', { hasText: OWNER }).first()
  await chip.click()
  await page.waitForURL(`${BASE}/app`, { timeout: 30000 })
  check('connexion → atterrissage sur /app', page.url() === `${BASE}/app`, `url=${page.url()}`)
  await page.waitForSelector('text=Accès restreint', { timeout: 30000 })
  check('plateforme rendue (mur MFA OWNER non enrôlé)', true)

  // ── ⑥ Logout + retour vitrine ──
  console.log('\n⑥ Logout et retour vitrine')
  await page.locator('button[title="Déconnexion"]').click()
  await page.waitForURL(/\/login/, { timeout: 30000 })
  check('logout → /login', true)
  await page.click('a:has-text("Retour au site vitrine")')
  await page.waitForURL(`${BASE}/`, { timeout: 30000 })
  check('retour sur la vitrine (/)', true)
  const heroVisible = (await page.locator('h1').first().innerText()).includes("système d'exploitation")
  check('accueil vitrine re-rendu', heroVisible)

  check('zéro erreur console/page', errors.length === 0, errors.slice(0, 3).join(' | '))

  await browser.close()
  console.log(`\n═══ RÉSULTAT : ${pass} PASS / ${fail} FAIL ═══`)
  if (fail) { console.log('Échecs : ' + fails.join(' · ')); process.exit(1) }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
