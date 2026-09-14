// Vérification UI — Onglet « Par construction » de la vue Gouvernance
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright'); // eslint-disable-line @typescript-eslint/no-require-imports

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const ok = (c, label) => { if (c) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } };

  // 1. Redirection vers /login (middleware)
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  ok(page.url().includes('/login'), `redirection login (${page.url()})`);

  // 2. Login OWNER
  await page.fill('input[type="email"]', 'akone@ivoire-distribution.ci');
  await page.fill('input[type="password"]', 'Demo2026!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1600);
  ok(!page.url().includes('/login'), 'login réussi → shell OS');

  // 3. Nav vers Gouvernance (sous-titre unique du nav item — évite « sous gouvernance » de Agents)
  await page.click('text=99 — policy · audit · evidence');
  await page.waitForTimeout(1400);
  ok(await page.locator('text=GOVERNANCE').first().isVisible(), 'vue Gouvernance affichée');

  // 4. Onglet Par construction
  await page.click('button[role="tab"]:has-text("Par construction")');
  await page.waitForTimeout(900);
  const badge = await page.locator('text=6/6 PASS').first().isVisible().catch(() => false);
  ok(badge, 'badge 6/6 PASS visible');
  ok(await page.locator('text=Exécuter les preuves de construction').isVisible(), 'bouton « Exécuter les preuves » présent');

  // 5. Cartes des 6 preuves
  for (const id of ['INV-001', 'INV-002', 'INV-007', 'INV-011', 'INV-012', 'INV-013']) {
    ok(await page.locator(`text=${id} —`).first().isVisible(), `carte preuve ${id}`);
  }
  ok(await page.locator('text=Contrats publics versionnés (INV-013)').first().isVisible(), 'table contrats INV-013');
  ok(await page.locator('text=YBOS-API').first().isVisible(), 'contrat YBOS-API listé');

  // 6. Ré-exécution des preuves → toast
  await page.click('text=Exécuter les preuves de construction');
  await page.waitForTimeout(2200);
  const toast = await page.locator('text=Preuves de construction : 6/6 PASS').first().isVisible().catch(() => false);
  ok(toast, 'toast « 6/6 PASS » après ré-exécution');

  // 7. Onglet Invariants : badge PAR CONSTRUCTION · VÉRIFIÉ sur INV-007
  await page.click('button[role="tab"]:has-text("Invariants")');
  await page.waitForTimeout(600);
  ok(await page.locator('text=PAR CONSTRUCTION · VÉRIFIÉ').first().isVisible(), 'invariants : badge « PAR CONSTRUCTION · VÉRIFIÉ »');

  // Screenshot
  await page.click('button[role="tab"]:has-text("Par construction")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/home/z/my-project/scripts/construction_tab_final.png', fullPage: false });

  console.log(`\n═══ UI: ${pass} PASS / ${fail} FAIL — erreurs JS: ${errors.length} ═══`);
  errors.slice(0, 5).forEach((e) => console.log('  ', e));
  await browser.close();
  process.exit(fail + (errors.length ? 1 : 0));
})();
