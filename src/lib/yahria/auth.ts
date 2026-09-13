// YAHRIA BUSINESS OS V1 — Authentification & RBAC (INV-002 Authorization)
// Sessions opaques en base (cookie httpOnly), mots de passe scrypt,
// matrice de permissions par rôle alignée sur la matrice de délégation
// du rapport d'audit (§7.1) : séparation comptable / approbateur.
import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped, db, runWithRls } from '@/lib/db'
import { ensureSeeded } from './seed'
import { hashPassword, verifyPassword } from './passwords'
import { API_CONTRACT } from './contracts'

export { hashPassword, verifyPassword }

export const SESSION_COOKIE = 'yahria_session'
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000

export type Role = 'OWNER' | 'ADMIN' | 'CFO' | 'ACCOUNTANT' | 'OPS' | 'AUDITOR'

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Dirigeant',
  ADMIN: 'Admin système',
  CFO: 'Directeur Financier',
  ACCOUNTANT: 'Comptable',
  OPS: 'Opérations',
  AUDITOR: 'Auditeur (lecture)',
}

// ── Matrice de permissions RBAC ──────────────────────────────────────────────
// '*' tout ; 'x.*' préfixe ; '*.read' toute lecture.
// Séparation des pouvoirs : ACCOUNTANT écrit la finance mais N'APPROUVE PAS.
const ROLE_PERMS: Record<Role, string[]> = {
  OWNER: ['*'],
  ADMIN: [
    'users.manage', 'users.read', 'policies.manage', 'agents.manage', 'agents.run', 'graph.rebuild',
    'governance.admin', 'governance.read', 'money.*', 'finance.*', 'core.*',
    'approvals.decide', 'copilot.use', 'evidence.read', 'audit.read',
  ],
  CFO: [
    'money.*', 'finance.*', 'approvals.decide', 'agents.run', 'copilot.use', 'evidence.read',
    'audit.read', 'governance.read', 'graph.rebuild', 'core.read', 'users.read',
  ],
  ACCOUNTANT: [
    'money.read', 'money.reconcile', 'finance.*', 'core.read', 'copilot.use',
    'evidence.read', 'governance.read',
  ],
  OPS: ['core.*', 'money.read', 'finance.read', 'copilot.use', 'graph.read'],
  AUDITOR: ['*.read', 'audit.read', 'evidence.read', 'governance.read', 'graph.read'],
}

export function permissionsOf(role: string): string[] {
  return ROLE_PERMS[(role as Role) ?? 'OPS'] ?? ROLE_PERMS.OPS
}

export function can(role: string, capability: string): boolean {
  for (const p of permissionsOf(role)) {
    if (p === '*') return true
    if (p === capability) return true
    if (p.endsWith('.*') && capability.startsWith(p.slice(0, -1))) return true
    if (p.startsWith('*.') && capability.endsWith(p.slice(1))) return true
  }
  return false
}

// ── Mots de passe (scrypt + sel aléatoire) — implémentation dans passwords.ts ──

// ── Sessions ─────────────────────────────────────────────────────────────────
export interface SessionUser {
  userId: string
  name: string
  email: string
  role: Role
  permissions: string[]
  orgId: string
  tenantId: string
  org: { name: string; legalName: string; countryCode: string; city: string; currencyCode: string }
  tenant: { name: string; plan: string }
}

export async function createSession(userId: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await dbUnscoped.session.create({ data: { token, userId, expiresAt, userAgent: userAgent ?? null } })
  return { token, expiresAt }
}

export async function destroySession(token: string) {
  await dbUnscoped.session.deleteMany({ where: { token } })
}

async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null
  const s = await dbUnscoped.session.findUnique({
    where: { token },
    include: { user: { include: { org: true, tenant: true } } },
  })
  if (!s || s.expiresAt < new Date() || s.user.status !== 'ACTIVE') return null
  return {
    userId: s.user.id,
    name: s.user.name,
    email: s.user.email,
    role: s.user.role as Role,
    permissions: permissionsOf(s.user.role),
    orgId: s.user.orgId,
    tenantId: s.user.tenantId,
    org: {
      name: s.user.org.name, legalName: s.user.org.legalName, countryCode: s.user.org.countryCode,
      city: s.user.org.city, currencyCode: s.user.org.currencyCode,
    },
    tenant: { name: s.user.tenant.name, plan: s.user.tenant.plan },
  }
}

export function sessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  return resolveSession(req.cookies.get(SESSION_COOKIE)?.value)
}

// ── Erreurs API ──────────────────────────────────────────────────────────────
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ── INV-013 : chaque réponse API porte la version du contrat public ─────────
function withContractHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-API-Version', API_CONTRACT.version)
  res.headers.set('X-Contract-Id', API_CONTRACT.contractId)
  return res
}

/**
 * Garde-fou standard des routes API :
 * 1. session valide (401)  2. permission requise (403)
 * 3. exécution sous périmètre RLS {tenantId, orgId} — INV-001
 */
export async function withAuth<T>(
  req: NextRequest,
  capability: string | null,
  handler: (s: SessionUser) => Promise<T>
): Promise<NextResponse> {
  await ensureSeeded()
  const s = await sessionFromRequest(req)
  if (!s) return withContractHeaders(NextResponse.json({ error: 'Authentification requise' }, { status: 401 }))
  if (capability && !can(s.role, capability)) {
    return withContractHeaders(
      NextResponse.json(
        { error: `Accès refusé — permission « ${capability} » requise (rôle : ${ROLE_LABELS[s.role]})` },
        { status: 403 }
      )
    )
  }
  try {
    const out = await runWithRls(
      { tenantId: s.tenantId, orgId: s.orgId, userId: s.userId, role: s.role },
      () => handler(s)
    )
    if (out instanceof NextResponse) return withContractHeaders(out)
    return withContractHeaders(NextResponse.json(out))
  } catch (e) {
    const err = e as Error
    if (err.message.startsWith('RLS_VIOLATION')) {
      return withContractHeaders(NextResponse.json({ error: err.message }, { status: 403 }))
    }
    if (err.message.startsWith('INV-007_VIOLATION')) {
      return withContractHeaders(NextResponse.json({ error: err.message }, { status: 409 }))
    }
    return withContractHeaders(NextResponse.json({ error: err.message || 'Erreur interne' }, { status: 400 }))
  }
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
  return res
}

export { db }
