import { PrismaClient } from '@prisma/client'
import { AsyncLocalStorage } from 'node:async_hooks'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// ─────────────────────────────────────────────────────────────────────────────
// YAHRIA RLS APPLICATIF (INV-001 / INV-TENANT / policy SEC-001)
// SQLite ne supporte pas la Row-Level Security native de PostgreSQL. V1 applique
// donc un RLS applicatif : un contexte {tenantId, orgId} est attaché à chaque
// requête HTTP (AsyncLocalStorage) et une extension Prisma FORCE :
//   · toute lecture  → filtre orgId (ou tenantId) injecté dans WHERE
//   · toute création → orgId (ou tenantId) écrasé avec la valeur du contexte
//   · update/delete  → pré-vérification du périmètre, sinon RLS_VIOLATION
// Le chemin Postgres (politiques CREATE POLICY ... USING) est fourni dans
// prisma/rls-postgres.sql pour la montée en production.
// ─────────────────────────────────────────────────────────────────────────────

export interface RlsContext {
  tenantId: string
  orgId: string
  userId: string
  role: string
}

const als = new AsyncLocalStorage<RlsContext>()

/**
 * Exécute `fn` avec le périmètre RLS attaché (propagé à travers tous les await).
 * ÉTANCHE PAR CONSTRUCTION : `fn` est attendue À L'INTÉRIEUR de la fenêtre
 * AsyncLocalStorage — le contexte couvre donc TOUTE l'exécution de la chaîne
 * Prisma, même quand l'appelant passe une flèche synchrone (motif
 * `runWithRls(ctx, () => handler(...))` utilisé par withAuth).
 */
export function runWithRls<T>(ctx: RlsContext, fn: () => Promise<T> | T): Promise<T> {
  return als.run(ctx, async () => await fn())
}

/** Contexte courant (null hors requête authentifiée — ex : seed). */
export function currentRls(): RlsContext | null {
  return als.getStore() ?? null
}

// Modèles porteurs d'un orgId — cloisonnement par organisation
// (noms NORMALISÉS en minuscules : Prisma fournit model en PascalCase, ex 'PaymentAccount')
const ORG_MODELS = new Set([
  'organization', 'customer', 'supplier', 'employee', 'product', 'paymentaccount',
  'payment', 'reconciliation', 'invoice', 'expense', 'account', 'journalentry',
  'graphnode', 'graphedge', 'agent', 'agentrun', 'approval', 'auditrecord', 'evidence',
])
// Modèles porteurs d'un tenantId (sans orgId) — cloisonnement par tenant
const TENANT_MODELS = new Set(['user'])
// Modèles ENFANTS d'un modèle org-scopé (pas d'orgId propre) : le périmètre se
// déduit de leur FK parente (ex : LedgerLine.entryId → JournalEntry.orgId).
// Sans ce traitement, ils étaient un angle mort du RLS (reads directs hors org).
const CHILD_SCOPE: Record<string, { fk: string; via: string }> = {
  ledgerline: { fk: 'entryId', via: 'entry' },
}
// Modèles globaux (countryPack, sectorEngine, policy*, session) : pas d'injection.
// policy porte un orgId nullable (policies globales) → filtrage explicite dans les routes.

// ── RLS APPROFONDIE : garde anti-FK étrangère ──────────────────────────────
// Le surchargé orgId garantit l'appartenance de la LIGNE créée, mais pas celle
// des lignes RÉFÉRENCÉES : sans garde, un create { customerId: <autre org> }
// attacherait un tiers hors périmètre (fuite indirecte). Chaque FK scalaire
// listée ci-dessous est vérifiée : la cible doit appartenir à ctx.orgId,
// sinon RLS_VIOLATION AVANT écriture.
const FK_ORG_GUARDS: Record<string, Record<string, string>> = {
  invoice: { customerId: 'customer' },
  invoiceline: { invoiceId: 'invoice', productId: 'product' },
  expense: { supplierId: 'supplier', paymentAccountId: 'paymentAccount' },
  payment: { invoiceId: 'invoice', expenseId: 'expense', paymentAccountId: 'paymentAccount' },
  reconciliation: { paymentId: 'payment' },
  ledgerline: { entryId: 'journalEntry' },
}

async function assertForeignKeysInScope(m: string, data: any, ctx: RlsContext): Promise<void> {
  const guards = FK_ORG_GUARDS[m]
  if (!guards || !data || typeof data !== 'object') return
  for (const [fk, target] of Object.entries(guards)) {
    const v = (data as any)[fk]
    if (v === undefined || v === null || typeof v !== 'string') continue
    const inScope = await (prisma as any)[target].count({ where: { id: v, orgId: ctx.orgId } })
    if (!inScope) {
      throw new Error(`RLS_VIOLATION : ${m}.${fk} → ${target}/${v.slice(0, 12)} hors du périmètre organisation (INV-001)`)
    }
  }
}

// ── INV-007 : EVENT IMMUTABILITY PAR CONSTRUCTION ────────────────────────────
// Les modèles porteurs d'événements publiés (audit, preuves signées, écritures
// comptables) sont APPEND-ONLY : toute opération mutative est refusée par la
// couche d'accès elle-même, AVANT d'atteindre la base. Ni le code métier, ni
// une route API, ni le client non scopé (dbUnscoped) ne peut contourner ce
// refus : la couche est la plus basse de la pile Prisma (elle enveloppe aussi
// l'extension RLS). La correction d'une erreur comptable passe donc par une
// écriture inverse (contre-passation), jamais par une modification.
const IMMUTABLE_MODELS = new Set(['auditrecord', 'evidence', 'journalentry', 'ledgerline'])
const MUTATING_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert'])

const baseWithImmutability = prisma.$extends({
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        const m = (model ?? '').toLowerCase()
        if (IMMUTABLE_MODELS.has(m) && MUTATING_OPS.has(operation)) {
          throw new Error(
            `INV-007_VIOLATION : ${m} est append-only — un événement publié ne peut être modifié ni supprimé (opération « ${operation} » refusée par construction)`
          )
        }
        return query(args)
      },
    },
  },
})

 
/** Périmètre injecté pour un modèle donné. L'organisation se scope par son propre id. */
function scopeFor(model: string, ctx: RlsContext): Record<string, string> {
  if (model === 'organization') return { id: ctx.orgId }
  if (ORG_MODELS.has(model)) return { orgId: ctx.orgId }
  return { tenantId: ctx.tenantId }
}

function injectReadFilter(model: string, args: any, ctx: RlsContext) {
  const scope = scopeFor(model, ctx)
  args.where = args.where ? { AND: [args.where, scope] } : scope
}

export const db = baseWithImmutability.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = als.getStore()
        const m = (model ?? '').toLowerCase()
        const camel = model ? model.charAt(0).toLowerCase() + model.slice(1) : m
        if (process.env.YAHRIA_RLS_DEBUG === '1' && (m === 'paymentaccount' || m === 'payment') && ['findUnique', 'create'].includes(operation)) {
          console.log(`[RLS-DEBUG] ${m}.${operation} ctx=${ctx ? ctx.orgId.slice(0, 6) : 'NULL'}`)
        }

        // Hors contexte authentifié (seed, login, jobs système) : pas d'injection.
        const isChild = !!CHILD_SCOPE[m]
        if (!ctx || !m || (!ORG_MODELS.has(m) && !TENANT_MODELS.has(m) && !isChild)) {
          return query(args)
        }
        const a: any = args ?? {}
        const childFilter = isChild ? { [CHILD_SCOPE[m].via]: { orgId: ctx.orgId } } : null

        switch (operation) {
          case 'findMany':
          case 'findFirst':
          case 'count':
          case 'aggregate':
          case 'groupBy': {
            if (childFilter) a.where = a.where ? { AND: [a.where, childFilter] } : childFilter
            else injectReadFilter(m, a, ctx)
            return query(a)
          }
          case 'findUnique':
          case 'findUniqueOrThrow':
          case 'findFirstOrThrow': {
            // Lecture ciblée → garde post-lecture sur le périmètre. Les variantes
            // OrThrow partagent EXACTEMENT la même garde (elles étaient autrefois
            // un angle mort du switch — corrigé : plus aucun read hors filtre).
            const row = (await query(a)) as { id?: string; orgId?: string; tenantId?: string } | null
            if (row && isChild) {
              const inScope = await (prisma as any)[camel].count({ where: { id: row.id, ...childFilter } })
              if (!inScope) throw new Error(`RLS_VIOLATION : ${m}/${row.id} hors du périmètre organisation (INV-001)`)
            }
            if (row && row.orgId !== undefined && row.orgId !== ctx.orgId) {
              throw new Error(`RLS_VIOLATION : ${m}/${row.id} hors du périmètre organisation (INV-001)`)
            }
            if (row && row.tenantId !== undefined && row.tenantId !== ctx.tenantId && !ORG_MODELS.has(m)) {
              throw new Error(`RLS_VIOLATION : ${m}/${row.id} hors du périmètre tenant (INV-001)`)
            }
            if (row && m === 'organization' && row.id !== ctx.orgId) {
              // Organization n'a pas d'orgId (elle EST l'org) : la garde se fait sur son id
              throw new Error(`RLS_VIOLATION : organization/${row.id} hors du périmètre authentifié (INV-001)`)
            }
            return row
          }
          case 'create': {
            if (m === 'organization') {
              throw new Error('RLS_VIOLATION : création d\'organisation interdite dans un périmètre authentifié (opération plateforme)')
            }
            await assertForeignKeysInScope(m, a.data, ctx)
            if (!isChild) a.data = { ...a.data, ...(ORG_MODELS.has(m) ? { orgId: ctx.orgId } : { tenantId: ctx.tenantId }) }
            return query(a)
          }
          case 'createMany':
          case 'createManyAndReturn': {
            if (isChild) {
              // Modèle enfant : pas d'orgId à injecter — la garde FK s'applique ligne à ligne
              const rows = Array.isArray(a.data) ? a.data : [a.data]
              for (const row of rows) await assertForeignKeysInScope(m, row, ctx)
              return query(a)
            }
            const scope = ORG_MODELS.has(m) ? { orgId: ctx.orgId } : { tenantId: ctx.tenantId }
            if (Array.isArray(a.data)) a.data = a.data.map((d: any) => ({ ...d, ...scope }))
            else a.data = { ...a.data, ...scope }
            return query(a)
          }
          case 'update':
          case 'delete': {
            // Pré-vérification : la ligne cible doit être dans le périmètre
            const scopeCheck = childFilter ? { ...(a.where ?? {}), ...childFilter } : { ...(a.where ?? {}), ...scopeFor(m, ctx) }
            const found = await (prisma as any)[camel].count({ where: scopeCheck })
            if (!found) {
              throw new Error(`RLS_VIOLATION : ${m} cible hors du périmètre authentifié (INV-001)`)
            }
            if (operation === 'update') await assertForeignKeysInScope(m, a.data, ctx)
            return query(a)
          }
          case 'updateMany':
          case 'deleteMany': {
            if (childFilter) a.where = a.where ? { AND: [a.where, childFilter] } : childFilter
            else injectReadFilter(m, a, ctx)
            return query(a)
          }
          case 'upsert': {
            if (isChild) {
              const exists = await (prisma as any)[camel].count({ where: { ...(a.where ?? {}), ...childFilter } })
              await assertForeignKeysInScope(m, a.create, ctx)
              if (!exists) {
                const outside = await (prisma as any)[camel].count({ where: a.where ?? {} })
                if (outside) throw new Error(`RLS_VIOLATION : upsert vers ${m} hors périmètre (INV-001)`)
              }
              return query(a)
            }
            const found = await (prisma as any)[camel].count({ where: { ...(a.where ?? {}), ...scopeFor(m, ctx) } })
            await assertForeignKeysInScope(m, a.create, ctx)
            a.create = { ...a.create, ...(ORG_MODELS.has(m) ? { orgId: ctx.orgId } : { tenantId: ctx.tenantId }) }
            if (!found) {
              // Ligne inexistante dans le périmètre : interdire le branchement sur une ligne étrangère
              const existsOutside = await (prisma as any)[camel].count({ where: a.where ?? {} })
              if (existsOutside) throw new Error(`RLS_VIOLATION : upsert vers ${m} hors périmètre (INV-001)`)
            }
            return query(a)
          }
          default:
            return query(a)
        }
      },
    },
  },
}) as unknown as PrismaClient

/**
 * Client sans RLS mais SOUMIS à l'immutabilité (INV-007) — réservé au login,
 * au seed et aux probes d'invariants. Aucun chemin d'accès ne contourne
 * l'append-only : c'est la couche la plus basse de la pile.
 */
export const dbUnscoped = baseWithImmutability as unknown as PrismaClient
