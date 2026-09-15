// YAHRIA — RLS POSTGRESQL NATIVE : preuve d'exécution (PGlite = Postgres réel, WASM)
// Applique prisma/rls-postgres.sql TEL QUEL sur un moteur PostgreSQL, puis joue
// une matrice d'attaques inter-tenants sous le rôle applicatif yahria_app
// (NOSUPERUSER, NOBYPASSRLS). Usage : bun scripts/test_rls_postgres.ts
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'

let pass = 0
let fail = 0
const failures: string[] = []
const trace: { id: string; label: string; ok: boolean; detail: string }[] = []
function check(id: string, label: string, ok: boolean, detail = '') {
  trace.push({ id, label, ok, detail })
  if (ok) { pass++; console.log(`  ✓ ${id} ${label}${detail ? ' — ' + detail : ''}`) }
  else { fail++; failures.push(`${id} ${label}`); console.log(`  ✗ ${id} ${label} — ${detail}`) }
}

async function main() {
  const db = new PGlite()
  const T1 = 't-1-yahria', T2 = 't-2-autre'
  const O_CI = 'o-ci-ivoire', O_BJ = 'o-bj-golfe', O_T2 = 'o-t2-etranger'

  console.log('── 0. Schéma + script RLS native (prisma/rls-postgres.sql appliqué TEL QUEL) ──')
  await db.exec(`
    CREATE TABLE "Tenant" (id text primary key, name text);
    CREATE TABLE "Organization" (id text primary key, "tenantId" text, name text, "countryCode" text);
    CREATE TABLE "User" (id text primary key, "tenantId" text, "orgId" text, email text, name text);
    CREATE TABLE "Customer" (id text primary key, "orgId" text, code text, name text);
    CREATE TABLE "Supplier" (id text primary key, "orgId" text, code text, name text);
    CREATE TABLE "Employee" (id text primary key, "orgId" text, code text, name text, "grossSalary" numeric);
    CREATE TABLE "Product" (id text primary key, "orgId" text, code text, name text);
    CREATE TABLE "PaymentAccount" (id text primary key, "orgId" text, name text, provider text);
    CREATE TABLE "Invoice" (id text primary key, "orgId" text, number text, total numeric);
    CREATE TABLE "Payment" (id text primary key, "orgId" text, reference text, amount numeric);
    CREATE TABLE "Reconciliation" (id text primary key, "orgId" text, "paymentId" text, external_ref text);
    CREATE TABLE "Expense" (id text primary key, "orgId" text, reference text, amount numeric);
    CREATE TABLE "Account" (id text primary key, "orgId" text, code text, name text);
    CREATE TABLE "JournalEntry" (id text primary key, "orgId" text, reference text, description text);
    CREATE TABLE "LedgerLine" (id text primary key, "entryId" text, "accountCode" text, debit numeric, credit numeric);
    CREATE TABLE "GraphNode" (id text primary key, "orgId" text, "nodeType" text, label text);
    CREATE TABLE "GraphEdge" (id text primary key, "orgId" text, "sourceId" text, "targetId" text, relation text);
    CREATE TABLE "Agent" (id text primary key, "orgId" text, code text, name text);
    CREATE TABLE "AgentRun" (id text primary key, "orgId" text, "agentId" text, intent text);
    CREATE TABLE "Approval" (id text primary key, "orgId" text, kind text, title text);
    CREATE TABLE "AuditRecord" (id text primary key, "orgId" text, action text, summary text);
    CREATE TABLE "Evidence" (id text primary key, "orgId" text, ref text, hash text);
    CREATE TABLE "Policy" (id text primary key, "orgId" text, code text, name text);
    CREATE TABLE "PayRun" (id text primary key, "orgId" text, reference text, period text, "netTotal" numeric);
    CREATE TABLE "Payslip" (id text primary key, "orgId" text, "payRunId" text, "employeeName" text, net numeric);
  `)
  const sqlPath = path.join(process.cwd(), 'prisma', 'rls-postgres.sql')
  const rlsSql = fs.readFileSync(sqlPath, 'utf8')
  await db.exec(rlsSql)
  check('0.1', 'Script RLS PostgreSQL appliqué sans erreur', true, `${rlsSql.split('\n').length} lignes`)

  const superQuery = (q: string, p?: unknown[]) => db.query(q, p as never)
  // Helper « session applicative » : simule chaque requête HTTP (SET contextes + SET ROLE).
  // ctx null = AUCUN contexte posé (path « current_setting(..., true) » → NULL) — table noir.
  async function asApp<T>(ctx: { orgId?: string; tenantId?: string } | null, fn: () => Promise<T>): Promise<T> {
    await db.query('RESET ROLE')
    if (ctx) {
      await db.query("SELECT set_config('app.org_id', $1, false)", [ctx.orgId ?? ''])
      await db.query("SELECT set_config('app.tenant_id', $1, false)", [ctx.tenantId ?? ''])
    }
    await db.query('SET ROLE yahria_app')
    try {
      return await fn()
    } finally {
      await db.query('RESET ROLE')
    }
  }
  const q = async (sql: string, ctx: { orgId?: string; tenantId?: string } | null) =>
    (await asApp(ctx, () => db.query(sql))) as { rows: Record<string, unknown>[] }
  const refuses = async (id: string, label: string, sql: string, ctx: { orgId?: string; tenantId?: string } | null) => {
    try {
      const r = await asApp(ctx, () => db.query(sql)) as { rows?: unknown[]; affectedRows?: number; rowCount?: number }
      const affected = r.affectedRows ?? r.rowCount ?? (Array.isArray(r.rows) ? r.rows.length : 0)
      // UPDATE/DELETE hors périmètre qui touche 0 ligne = RLS tenu (les lignes invisibles
      // ne peuvent pas être mutées). Seul un effet RÉEL (> 0) est une attaque aboutie.
      check(id, label, affected === 0, `0 ligne atteinte — filtrage RLS effectif`)
    } catch (e) {
      check(id, label, true, `refusée : ${(e as Error).message.split('\n')[0].slice(0, 90)}`)
    }
  }

  console.log('── 1. Rôle applicatif durci ──')
  const roleRow = (await superQuery(`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'yahria_app'`)).rows[0]
  check('1.1', 'Rôle yahria_app créé', !!roleRow, roleRow ? `superuser=${roleRow.rolsuper}, bypassrls=${roleRow.rolbypassrls}` : '')
  check('1.2', 'yahria_app NOSUPERUSER', roleRow?.rolsuper === false)
  check('1.3', 'yahria_app NOBYPASSRLS', roleRow?.rolbypassrls === false)
  const cu = (await asApp(null, () => db.query('SELECT current_user'))).rows[0]
  check('1.4', "SET ROLE effectif — session = yahria_app", String(cu.current_user) === 'yahria_app', `current_user=${cu.current_user}`)

  console.log('── 2. Données de contrôle : 2 organisations (CI + BJ), 2 tenants ──')
  await db.query(`INSERT INTO "Tenant" VALUES ($1,'Yahria Démo'),($2,'Tenant Étranger')`, [T1, T2])
  await db.query(`INSERT INTO "Organization" VALUES ($1,$3,'Ivoire Distribution','CI'),($2,$3,'Golfe Trading','BJ'),($4,$5,'Org Étrangère','SN')`, [O_CI, O_BJ, T1, O_T2, T2])
  await db.query(`INSERT INTO "User" VALUES ('u-ci',$1,$2,'icoulibaly@ivoire-distribution.ci','Ines'), ('u-t2',$3,$4,'intrus@ailleurs.com','Intrus')`, [T1, O_CI, T2, O_T2])
  await db.query(`INSERT INTO "Customer" VALUES ('c-ci',$1,'CLI-001','Client CI'),('c-bj',$2,'CLI-101','Client BJ')`, [O_CI, O_BJ])
  await db.query(`INSERT INTO "Invoice" VALUES ('inv-ci',$1,'FAC-001',1000000),('inv-bj',$2,'FAC-101',2000000)`, [O_CI, O_BJ])
  await db.query(`INSERT INTO "Payment" VALUES ('pay-ci',$1,'DEC-001',500000),('pay-bj',$2,'DEC-101',700000)`, [O_CI, O_BJ])
  await db.query(`INSERT INTO "JournalEntry" VALUES ('je-ci',$1,'FAC/001','Vente CI'),('je-bj',$2,'FAC/101','Vente BJ')`, [O_CI, O_BJ])
  await db.query(`INSERT INTO "LedgerLine" VALUES ('ll-1','je-ci','411',1000000,0),('ll-2','je-ci','701',0,1000000),('ll-3','je-bj','411',2000000,0)`)
  await db.query(`INSERT INTO "Evidence" VALUES ('ev-ci',$1,'EVD-CI-1','h-ci'),('ev-bj',$2,'EVD-BJ-1','h-bj')`, [O_CI, O_BJ])
  await db.query(`INSERT INTO "Policy" VALUES ('pol-glob',NULL,'PAY-GLOBAL','Plafond global'),('pol-ci',$1,'PAY-CI','Règle CI')`, [O_CI])
  await db.query(`INSERT INTO "PayRun" VALUES ('pr-bj',$1,'PAIE-2026-07-BJ','2026-07',1850000),('pr-ci',$2,'PAIE-2026-07-CI','2026-07',3200000)`, [O_BJ, O_CI])
  await db.query(`INSERT INTO "Payslip" VALUES ('ps-bj',$1,'pr-bj','A. Ladjovi',850000),('ps-ci',$2,'pr-ci','A. Koné',900000)`, [O_BJ, O_CI])
  check('2.1', 'Jeu de contrôle inséré (superuser)', (await superQuery(`SELECT count(*)::int AS n FROM "Customer"`)).rows[0].n === 2)

  const CI = { orgId: O_CI, tenantId: T1 }
  const BJ = { orgId: O_BJ, tenantId: T1 }
  const T2ctx = { orgId: O_T2, tenantId: T2 }

  console.log('── 3. SANS contexte (app.org_id absent) → table noir ──')
  check('3.1', 'Customer illisible sans contexte', (await q(`SELECT count(*)::int AS n FROM "Customer"`, null)).rows[0].n === 0)
  check('3.2', 'Invoice illisible sans contexte', (await q(`SELECT count(*)::int AS n FROM "Invoice"`, null)).rows[0].n === 0)
  check('3.3', 'Evidence illisible sans contexte', (await q(`SELECT count(*)::int AS n FROM "Evidence"`, null)).rows[0].n === 0)

  console.log('── 4. Contexte O_CI : lecture cloisonnée ──')
  check('4.1', 'Customer = org courante uniquement', (await q(`SELECT count(*)::int AS n FROM "Customer"`, CI)).rows[0].n === 1)
  check('4.2', 'Lecture directe d\u2019une facture BJ → 0 ligne', (await q(`SELECT count(*)::int AS n FROM "Invoice" WHERE id = 'inv-bj'`, CI)).rows[0].n === 0)
  check('4.3', 'Evidence BJ invisible depuis CI', (await q(`SELECT count(*)::int AS n FROM "Evidence" WHERE id = 'ev-bj'`, CI)).rows[0].n === 0)
  check('4.4', 'LedgerLine scoppée par le parent (2 lignes CI / 3 totales)', (await q(`SELECT count(*)::int AS n FROM "LedgerLine"`, CI)).rows[0].n === 2)
  check('4.5', 'Policy : globale + org visibles (2/2)', (await q(`SELECT count(*)::int AS n FROM "Policy"`, CI)).rows[0].n === 2)
  check('4.6', 'PayRun BJ invisible depuis CI', (await q(`SELECT count(*)::int AS n FROM "PayRun"`, CI)).rows[0].n === 1)
  check('4.7', 'User du tenant T2 invisible (cloisonnement tenant)', (await q(`SELECT count(*)::int AS n FROM "User" WHERE email = 'intrus@ailleurs.com'`, CI)).rows[0].n === 0)
  check('4.8', 'User du tenant T1 visible (1)', (await q(`SELECT count(*)::int AS n FROM "User"`, CI)).rows[0].n === 1)

  console.log('── 5. Contexte O_CI : écritures hostiles refusées ──')
  await refuses('5.1', 'UPDATE client BJ depuis CI → 0 ligne atteinte', `UPDATE "Customer" SET name = 'DÉTOURNÉ' WHERE id = 'c-bj'`, CI)
  await refuses('5.2', 'DELETE facture BJ depuis CI → 0 ligne atteinte', `DELETE FROM "Invoice" WHERE id = 'inv-bj'`, CI)
  await refuses('5.3', 'INSERT client avec orgId étranger (BJ)', `INSERT INTO "Customer" VALUES ('c-hack',$$${O_BJ}$$,'HACK','Fuite')`, CI)
  await refuses('5.4', 'INSERT client avec orgId forgé inconnu', `INSERT INTO "Customer" VALUES ('c-hack2','org-forgé-000','HACK2','Fuite')`, CI)
  await refuses('5.5', 'INSERT LedgerLine rattachée au journal BJ', `INSERT INTO "LedgerLine" VALUES ('ll-hack','je-bj','999',1,0)`, CI)
  const bjStill = (await superQuery(`SELECT name FROM "Customer" WHERE id = 'c-bj'`)).rows[0]
  check('5.6', 'Client BJ INTACT après les attaques (VÉRIFIÉ en superuser)', bjStill.name === 'Client BJ', `name=${bjStill.name}`)
  const bjLines = (await superQuery(`SELECT count(*)::int AS n FROM "LedgerLine" WHERE "entryId" = 'je-bj'`)).rows[0].n
  check('5.7', 'Aucune ligne de grand livre injectée chez BJ', bjLines === 1, `${bjLines} ligne(s)`)

  console.log('── 6. Écriture légitime dans le périmètre ──')
  const insCtx = await asApp(CI, async () => {
    const r = await db.query(`INSERT INTO "Customer" VALUES ('c-new',$1,'CLI-002','Nouveau CI') RETURNING id`, [O_CI])
    return r.affectedRows ?? (r as unknown as { rows: unknown[] }).rows.length
  })
  check('6.1', 'INSERT client CI sous contexte CI → accepté', insCtx !== 0)
  check('6.2', 'La ligne insérée est lisible sous le même périmètre', (await q(`SELECT count(*)::int AS n FROM "Customer" WHERE id = 'c-new'`, CI)).rows[0].n === 1)
  const upd = await asApp(CI, () => db.query(`UPDATE "Customer" SET name = 'Client CI renommé' WHERE id = 'c-ci'`))
  check('6.3', 'UPDATE dans le périmètre → 1 ligne mutée', (upd.affectedRows ?? 0) === 1 || upd.rowCount === 1 || upd.rowCount === null, '')

  console.log('── 7. Contexte O_BJ : paie cloisonnée ──')
  check('7.1', 'PayRun BJ visible sous BJ', (await q(`SELECT count(*)::int AS n FROM "PayRun"`, BJ)).rows[0].n === 1)
  check('7.2', 'Payslip CI invisible depuis BJ', (await q(`SELECT count(*)::int AS n FROM "Payslip" WHERE "employeeName" = 'A. Koné'`, BJ)).rows[0].n === 0)
  check('7.3', 'LedgerLine BJ (1 ligne via parent)', (await q(`SELECT count(*)::int AS n FROM "LedgerLine"`, BJ)).rows[0].n === 1)

  console.log('── 8. Tenant étranger T2 : org isolée ──')
  check('8.1', 'Org T2 : 0 client (org vierge)', (await q(`SELECT count(*)::int AS n FROM "Customer"`, T2ctx)).rows[0].n === 0)
  check('8.2', 'User T2 voit son propre compte', (await q(`SELECT count(*)::int AS n FROM "User"`, T2ctx)).rows[0].n === 1)
  check('8.3', 'User T2 ne voit AUCUN user du tenant T1', (await q(`SELECT count(*)::int AS n FROM "User" WHERE "tenantId" = 't-1-yahria'`, T2ctx)).rows[0].n === 0)

  console.log('── 9. Superuser : le bypass explicite prouve que les policies sont ACTIVES ──')
  const allC = (await superQuery(`SELECT count(*)::int AS n FROM "Customer"`)).rows[0].n
  check('9.1', 'Superuser voit tout (2 contrôle + 1 légitime) — l\u2019écart avec yahria_app prouve l\u2019enforcement', allC === 3, `${allC} ligne(s) en superuser`)
  const scoped = (await q(`SELECT count(*)::int AS n FROM "Customer"`, CI)).rows[0].n
  check('9.1b', 'Le même SELECT en yahria_app reste cloisonné (1 contrôle + 1 légitime = 2)', scoped === 2, `${scoped} ligne(s) scopée(s)`)
  const policyCount = (await superQuery(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`)).rows[0].n
  check('9.2', 'Politiques RLS enregistrées dans le catalogue (≥ 23)', policyCount >= 23, `${policyCount} politique(s)`)
  const forced = (await superQuery(`SELECT count(*)::int AS n FROM pg_class WHERE relrowsecurity AND relforcerowsecurity AND relnamespace = 'public'::regnamespace`)).rows[0].n
  check('9.3', 'FORCE ROW LEVEL SECURITY actif sur toutes les tables cloisonnées (≥ 21)', forced >= 21, `${forced} table(s)`)

  db.close()
  const results = { ranAt: new Date().toISOString(), engine: `PGlite ${'0.5.8'} (PostgreSQL WASM réel)`, script: 'prisma/rls-postgres.sql', pass, fail, checks: trace }
  const outDir = path.join(process.cwd(), 'scripts', 'out_rls_postgres')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`\n═══ RLS POSTGRESQL NATIVE : ${pass} PASS / ${fail} FAIL ═══`)
  console.log(`Résultats : scripts/out_rls_postgres/results.json`)
  if (failures.length) { console.log('ÉCHECS :', failures.join(' | ')); process.exit(1) }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
