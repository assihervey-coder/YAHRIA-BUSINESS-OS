// Test roue réelle : indépendance de scroll des deux bandes YAHRIA OS
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright'); // eslint-disable-line @typescript-eslint/no-require-imports

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 620 } }); // petit écran -> nav gauche déborde
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const read = () => page.evaluate(() => {
    const aside = document.querySelector('aside');
    const nav = aside.querySelector('nav');
    const mainCol = aside.nextElementSibling;
    return {
      navScrollTop: Math.round(nav.scrollTop),
      navScrollable: nav.scrollHeight > nav.clientHeight,
      mainScrollTop: Math.round(mainCol.scrollTop),
      pageScrollY: window.scrollY,
    };
  });

  const r0 = await read();
  console.log('ÉTAT INITIAL           :', JSON.stringify(r0));

  // ── TEST 1 : roue sur la GRANDE BANDE DROITE ──
  await page.mouse.move(900, 300);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(400);
  const r1 = await read();
  const t1 = r1.mainScrollTop > 0 && r1.navScrollTop === 0 && r1.pageScrollY === 0;
  console.log('ROUE SUR BANDE DROITE  :', JSON.stringify(r1), '=>', t1 ? 'OK droite bouge, gauche immobile' : 'ÉCHEC');

  // ── TEST 2 : roue sur la BANDE DE GAUCHE (nav) ──
  await page.mouse.move(120, 300);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  const r2 = await read();
  const t2 = r2.navScrollTop > 0 && r2.mainScrollTop === r1.mainScrollTop;
  console.log('ROUE SUR BANDE GAUCHE  :', JSON.stringify(r2), '=>', t2 ? 'OK gauche bouge, droite immobile' : 'ÉCHEC');

  // ── TEST 3 : fin de course gauche -> pas de chaînage vers la droite (overscroll-contain) ──
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(80); }
  await page.waitForTimeout(400);
  const r3 = await read();
  const t3 = r3.mainScrollTop === r2.mainScrollTop;
  console.log('OVERSCROLL GAUCHE      :', JSON.stringify(r3), '=>', t3 ? 'OK aucun chaînage vers la droite' : 'ÉCHEC chaînage détecté');

  // ── TEST 4 : la droite re-défile sans toucher à la gauche ──
  await page.mouse.move(900, 300);
  await page.mouse.wheel(0, -500); // remonter un peu
  await page.waitForTimeout(400);
  const r4 = await read();
  const t4 = r4.mainScrollTop < r3.mainScrollTop && r4.navScrollTop === r3.navScrollTop;
  console.log('RETOUR ROUE DROITE     :', JSON.stringify(r4), '=>', t4 ? 'OK droite seule bouge' : 'ÉCHEC');

  await page.screenshot({ path: '/home/z/my-project/scripts/scroll_test_final.png' });
  await browser.close();

  const all = [t1, t2, t3, t4].every(Boolean);
  console.log(all ? '\n*** VERDICT : INDÉPENDANCE TOTALE DES DEUX BANDES — 4/4 TESTS OK ***' : '\n*** VERDICT : ÉCHEC — voir ci-dessus ***');
  process.exit(all ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
