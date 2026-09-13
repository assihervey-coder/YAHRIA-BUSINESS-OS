-- ═══════════════════════════════════════════════════════════════════════════
-- YAHRIA BUSINESS OS V1 — Row-Level Security PostgreSQL (chemin production)
-- ───────────────────────────────────────────────────────────────────────────
-- La V1 tourne sur SQLite (RLS non supportée) avec un RLS APPLICATIF équivalent
-- (src/lib/db.ts — extension Prisma + AsyncLocalStorage). Lors de la migration
-- vers PostgreSQL, exécuter ce script pour déplacer la garantie au niveau base :
-- même si l'application est compromise, la base refuse les fuites inter-tenants.
--
-- Usage :
--   SET app.tenant_id = '<tenant-uuid>';
--   SET app.org_id    = '<org-uuid>';
-- (via Prisma : $executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Modèles cloisonnés par ORGANISATION ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Customer','Supplier','Employee','Product','PaymentAccount','Payment',
    'Reconciliation','Invoice','Expense','Account','JournalEntry','GraphNode',
    'GraphEdge','Agent','AgentRun','Approval','AuditRecord','Evidence'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- Lecture/écriture : seules les lignes de l'org courante sont visibles
    EXECUTE format($f$
      CREATE POLICY %I_isolation ON %I
      USING ("orgId" = current_setting('app.org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.org_id', true)::text)
    $f$, t, t);
  END LOOP;
END $$;

-- ── 2. Modèles cloisonnés par TENANT ──
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON "User"
  USING ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ── 3. Policy : globale (orgId NULL) lisible par tous, org-scoped sinon ──
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_isolation ON "Policy"
  USING ("orgId" IS NULL OR "orgId" = current_setting('app.org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.org_id', true)::text);

-- ── 4. Tables globales (lecture seule applicative, pas de RLS) ──
-- "CountryPack", "SectorEngine" : partagées entre tenants (référentiel national).

-- ── 5. Garantie d'administration ──
-- REBYPASS : le rôle applicatif Prisma ne doit PAS être superuser/BYPASSRLS.
-- ALTER ROLE yahria_app NOBYPASSRLS;
-- Vérification : SET app.org_id = 'org-benin'; SELECT count(*) FROM "Payment";
-- → ne doit retourner QUE les paiements de l'org béninoise (INV-001, INV-011).
