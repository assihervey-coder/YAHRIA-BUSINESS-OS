-- ═══════════════════════════════════════════════════════════════════════════
-- YAHRIA BUSINESS OS V1 — Row-Level Security PostgreSQL NATIVE (chemin prod)
-- ───────────────────────────────────────────────────────────────────────────
-- La V1 démo tourne sur SQLite (RLS non supportée) avec un RLS APPLICATIF
-- équivalent (src/lib/db.ts — extension Prisma + AsyncLocalStorage). Sur
-- PostgreSQL, ce script déplace la garantie au niveau BASE : même si
-- l'application est intégralement compromise, la base refuse toute fuite
-- inter-tenants (INV-001 / INV-011).
--
-- PREUVE D'EXÉCUTION : scripts/test_rls_postgres.ts (PGlite = Postgres réel,
-- WASM) applique CE script tel quel puis joue une matrice d'attaques —
-- résultats dans scripts/out_rls_postgres/results.json + carte Gouvernance.
--
-- Usage applicatif (une transaction = un périmètre) :
--   SET app.tenant_id = '<tenant-uuid>';
--   SET app.org_id    = '<org-uuid>';
-- (Prisma : $executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`)
--
-- PRINCIPE (défense en profondeur, 3 couches) :
--   1. Rôle applicatif DÉPOURVU de privilèges d'administration :
--      yahria_app = NOSUPERUSER, NOBYPASSRLS — rien ne contourne les policies
--   2. FORCE ROW LEVEL SECURITY : même le PROPRIÉTAIRE des tables est soumis
--      aux politiques (seul un superuser explicite passe — opération contrôlée)
--   3. USING + WITH CHECK sur chaque table : lecture ET écriture filtrées —
--      insérer une ligne étrangère est aussi impossible que la lire
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Rôle applicatif — jamais superuser, jamais BYPASSRLS ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yahria_app') THEN
    CREATE ROLE yahria_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO yahria_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO yahria_app;

-- ── 1. Modèles cloisonnés par ORGANISATION ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Customer','Supplier','Employee','Product','PaymentAccount','Payment',
    'Reconciliation','Invoice','Expense','Account','JournalEntry','GraphNode',
    'GraphEdge','Agent','AgentRun','Approval','AuditRecord','Evidence',
    'PayRun','Payslip'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- Lecture/écriture : seules les lignes de l'org courante sont visibles
    EXECUTE format($f$
      CREATE POLICY %I ON %I
      USING ("orgId" = current_setting('app.org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.org_id', true)::text)
    $f$, t || '_isolation', t);
  END LOOP;
END $$;

-- ── 2. Portée ENFANT : LedgerLine (pas d'orgId propre) ──
-- Une ligne de grand livre hérite du périmètre de son JournalEntry parent
-- (miroir exact du CHILD_SCOPE applicatif de src/lib/db.ts).
ALTER TABLE "LedgerLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LedgerLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY ledgerline_isolation ON "LedgerLine"
  USING (EXISTS (
    SELECT 1 FROM "JournalEntry" je
    WHERE je.id = "LedgerLine"."entryId"
      AND je."orgId" = current_setting('app.org_id', true)::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "JournalEntry" je
    WHERE je.id = "LedgerLine"."entryId"
      AND je."orgId" = current_setting('app.org_id', true)::text
  ));

-- ── 3. Modèle cloisonné par TENANT ──
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON "User"
  USING ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ── 4. Policy : globale (orgId NULL) lisible par tous, org-scoped sinon ──
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_isolation ON "Policy"
  USING ("orgId" IS NULL OR "orgId" = current_setting('app.org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.org_id', true)::text);

-- ── 5. Tables globales (référentiel national — pas de RLS) ──
-- "CountryPack", "SectorEngine", "Tenant" : partagées (référentiel/plateforme).
-- L'écriture reste réservée aux opérations plateforme (jamais yahria_app).

-- ── 6. Garanties d'administration ──
-- · yahria_app : NOSUPERUSER + NOBYPASSRLS (section 0) — le rôle applicatif
--   Prisma ne doit JAMAIS être superuser.
-- · FORCE RLS : même le propriétaire des tables est soumis aux politiques.
-- · Vérification de mise en service :
--     SET ROLE yahria_app; SELECT set_config('app.org_id', '<org-benin>', false);
--     SELECT count(*) FROM "Payment";
--   → ne retourne QUE les paiements de l'org béninoise (INV-001 / INV-011).
-- · Preuve automatisée : bun scripts/test_rls_postgres.ts (matrice d'attaques).
