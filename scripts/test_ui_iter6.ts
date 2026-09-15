// YAHRIA BUSINESS OS V1 — Vérification navigateur ITÉRATION 6 (Playwright)
// ① Login OWNER → mur MFA → enrôlement assist (code auto-rempli) → entrée plateforme
// ② Finance → onglet Paie : journal PAIE, run 2026-07, bulletins (dialog)
// ③ Gouvernance → Sécurité : carte RLS PostgreSQL NATIVE (preuve) + contrat sectoriel v2
// Usage : npx tsx scripts/test_ui_iter6.ts
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const BASE = 'http://localhost:3000'
const shots = '/home/z/my-project/scripts'

let pass = 0
let fail = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`) }
  else { fail++; failures.push(label); console.log(`  ✗ ${label} — ${detail}`) }
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  // ① Login OWNER (akone) — passerelle 2FA : défi (enrôlé) OU enrôlement assist (non enrôlé)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type=email]', 'akone@ivoire-distribution.ci')
  await page.fill('input[type=password]', 'Demo2026!')
  await page.click('button[type=submit]')
  const challenge = page.waitForSelector('text=Vérifier et se connecter', { timeout: 30000 }).then(() => 'challenge' as const)
  const enroll = page.waitForSelector('text=Vérifier & activer', { timeout: 30000 }).then(() => 'enroll' as const)
  const branch = await Promise.race([challenge, enroll])
  if (branch === 'challenge') {
    // Défi MFA : code TOTP auto-rempli en mode assist → vérifier
    await page.waitForFunction(() => {
      const el = document.querySelector('input[placeholder="123456 ou AB12-CD34"]') as HTMLInputElement | null
      return !!el && /^\d{6}$/.test(el.value)
    }, { timeout: 15000 })
    check('① défi MFA à la passerelle — code TOTP auto-rempli (assist)', true)
    await page.click('text=Vérifier et se connecter')
  } else {
    // Enrôlement à la passerelle (utilisateur non enrôlé)
    await page.waitForFunction(() => {
      const el = document.querySelector('input[placeholder="123456"]') as HTMLInputElement | null
      return !!el && /^\d{6}$/.test(el.value)
    }, { timeout: 15000 })
    check('① enrôlement 2FA à la passerelle — code auto-rempli (assist)', true)
    await page.click('text=Vérifier & activer')
    await page.waitForSelector('text=Codes de récupération — à conserver', { timeout: 20000 })
    await page.click('text=J\'ai noté mes codes — Accéder à la plateforme')
  }
  await page.screenshot({ path: `${shots}/i6_enroll.png` })
  await page.waitForURL(`${BASE}/app`, { timeout: 30000 })
  check('① 2FA validée à la passerelle → entrée plateforme (/app)', true)
  await page.waitForTimeout(1500)

  // ② Finance → onglet Paie
  await page.click('nav >> text=Finance')
  await page.waitForTimeout(2000)
  await page.click('[role=tab]:has-text("Paie")')
  await page.waitForSelector('text=Journal de paie', { timeout: 20000 })
  await page.waitForTimeout(800)
  const body = await page.textContent('body')
  check('② onglet Paie rendu (journal PAIE)', body?.includes('Journal de paie — SYSCOHADA') === true)
  check('② run 2026-07 visible', body?.includes('2026-07') === true)
  check('② paramètres pack CNPS affichés', body?.includes('CNPS') === true && body?.includes('Cotes sociales') === true)
  check('② écritures comptabilisées mentionnées (6641/4311/4321/4221)', body?.includes('6641') === true && body?.includes('4311') === true && body?.includes('4321') === true && body?.includes('4221') === true)
  await page.screenshot({ path: `${shots}/i6_paie.png` })
  console.log('✓ onglet Paie capturé')

  // Bulletins (dialog)
  await page.click('button:has-text("bulletins")')
  await page.waitForSelector('text=Matricule', { timeout: 15000 })
  const dlg = await page.textContent('body')
  check('② dialog bulletins : tableau salariale', dlg?.includes('Matricule') === true && dlg?.includes('Net') === true)
  await page.screenshot({ path: `${shots}/i6_bulletins.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ③ Gouvernance → onglet Sécurité — RLS & Signatures
  await page.click('nav >> text="Gouvernance"')
  await page.waitForTimeout(2500)
  await page.click('[role=tab]:has-text("Sécurité — RLS")')
  await page.waitForSelector('text=RLS PostgreSQL NATIVE', { timeout: 25000 })
  const gov = await page.textContent('body')
  check('③ carte RLS PostgreSQL NATIVE rendue', gov?.includes('RLS PostgreSQL NATIVE') === true)
  check('③ preuve 37/37 affichée', /PREUVE\s+37\/37/.test(gov ?? '') === true, (gov?.match(/PREUVE\s+\d+\/\d+/) ?? ['absente'])[0])
  check('③ contrat sectoriel versionné (v2 courante + v1 supportée)', gov?.includes('Contrat sectoriel versionné') === true && gov?.includes('— courante') === true && gov?.includes('— supportée') === true)
  check('③ hooks v2 facture/paie affichés', gov?.includes('hooks v2') === true)
  await page.screenshot({ path: `${shots}/i6_governance.png` })
  console.log('✓ gouvernance (Sécurité) capturée')

  // Nettoyage : désenrôlement — base démo neutre
  await page.request.post(`${BASE}/api/v1/auth/2fa/disable`)
  execSync(`node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.updateMany({where:{totpEnabledAt:{not:null}},data:{totpSecret:null,totpEnabledAt:null,recoveryCodes:null}}).then(r=>{console.log('désenrôlé:',r.count);return p.\\$disconnect()})"`, { cwd: '/home/z/my-project', stdio: 'inherit' })

  const realErrors = errors.filter((e) => !/favicon|hydration|Warning|third-party/i.test(e))
  check('aucune erreur console bloquante', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  await browser.close()
  console.log(`\n═══ UI ITÉRATION 6 : ${pass} PASS / ${fail} FAIL ═══`)
  if (failures.length) { console.log('ÉCHECS :', failures.join(' | ')); process.exit(1) }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
