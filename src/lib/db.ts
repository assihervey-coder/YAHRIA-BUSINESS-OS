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

/** Exécute `fn` avec le périmètre RLS attaché (propagé à travers tous les await). */
export function runWithRls<T>(ctx: RlsContext, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn)
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
// Modèles globaux (countryPack, sectorEngine, policy*, session) : pas d'injection.
// policy porte un orgId nullable (policies globales) → filtrage explicite dans les routes.

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
        if (!ctx || !m || (!ORG_MODELS.has(m) && !TENANT_MODELS.has(m))) {
          return query(args)
        }
        const a: any = args ?? {}

        switch (operation) {
          case 'findMany':
          case 'findFirst':
          case 'count':
          case 'aggregate':
          case 'groupBy': {
            injectReadFilter(m, a, ctx)
            return query(a)
          }
          case 'findUnique': {
            // Lecture par identifiant unique → garde post-lecture sur le périmètre
            const row = (await query(a)) as { id?: string; orgId?: string; tenantId?: string } | null
            if (row && row.orgId !== undefined && row.orgId !== ctx.orgId) {
              throw new Error(`RLS_VIOLATION : ${m}/${row.id} hors du périmètre organisation (INV-001)`)
            }
            if (row && row.tenantId !== undefined && row.tenantId !== ctx.tenantId && !ORG_MODELS.has(m)) {
              throw new Error(`RLS_VIOLATION : ${m}/${row.id} hors du périmètre tenant (INV-001)`)
            }
            return row
          }
          case 'create': {
            if (m === 'organization') {
              throw new Error('RLS_VIOLATION : création d\'organisation interdite dans un périmètre authentifié (opération plateforme)')
            }
            a.data = { ...a.data, ...(ORG_MODELS.has(m) ? { orgId: ctx.orgId } : { tenantId: ctx.tenantId }) }
            return query(a)
          }
          case 'createMany':
          case 'createManyAndReturn': {
            const scope = ORG_MODELS.has(m) ? { orgId: ctx.orgId } : { tenantId: ctx.tenantId }
            if (Array.isArray(a.data)) a.data = a.data.map((d: any) => ({ ...d, ...scope }))
            else a.data = { ...a.data, ...scope }
            return query(a)
          }
          case 'update':
          case 'delete': {
            // Pré-vérification : la ligne cible doit être dans le périmètre
            const found = await (prisma as any)[camel].count({ where: { ...(a.where ?? {}), ...scopeFor(m, ctx) } })
            if (!found) {
              throw new Error(`RLS_VIOLATION : ${m} cible hors du périmètre authentifié (INV-001)`)
            }
            return query(a)
          }
          case 'updateMany':
          case 'deleteMany': {
            injectReadFilter(m, a, ctx)
            return query(a)
          }
          case 'upsert': {
            const found = await (prisma as any)[camel].count({ where: { ...(a.where ?? {}), ...scopeFor(m, ctx) } })
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
