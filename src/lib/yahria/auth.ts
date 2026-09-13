// YAHRIA BUSINESS OS V1 — Authentification & RBAC (INV-002 Authorization)
// Sessions OPAQUES ROTATIVES en base (cookie httpOnly) — voir sessions.ts :
// TTL glissant + plafond absolu + rotation + détection de réutilisation.
// Mots de passe scrypt, matrice de permissions par rôle alignée sur la matrice
// de délégation du rapport d'audit (§7.1) : séparation comptable / approbateur.
// 2FA TOTP : obligatoire PAR CONSTRUCTION, déployée par VAGUES de rôles (SEC-003).
import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped, db, runWithRls } from '@/lib/db'
import { ensureSeeded } from './seed'
import { hashPassword, verifyPassword } from './passwords'
import { API_CONTRACT } from './contracts'
import {
  createSession as createRotatingSession,
  resolveLiveSession,
  revokeSessionById,
  revokeAllForUser,
  rotateSession,
  listActiveSessions,
} from './sessions'

export { hashPassword, verifyPassword }

export const SESSION_COOKIE = 'yahria_session'

// ── SEC-003 : 2FA obligatoire par VAGUES (verrouillage progressif) ──────────
// Vague 1 — OWNER, CFO       : direction financière (verrouillée depuis l'itération 4)
// Vague 2 — ADMIN, ACCOUNTANT: administration système & comptabilité
// Vague 3 — OPS, AUDITOR     : opérations & audit → couverture TOTALE des rôles
// La vague ACTIVE est pilotée par la variable d'environnement YAHRIA_MFA_WAVE
// (défaut 3 = tous les rôles verrouillés). Un rôle non enrôlé d'une vague
// active ne peut accéder à AUCUNE route métier (whitelist auth uniquement).
export const MFA_WAVES: ReadonlyArray<{ wave: number; roles: readonly string[]; label: string }> = [
  { wave: 1, roles: ['OWNER', 'CFO'], label: 'Direction — OWNER, CFO' },
  { wave: 2, roles: ['ADMIN', 'ACCOUNTANT'], label: 'Administration & comptabilité — ADMIN, ACCOUNTANT' },
  { wave: 3, roles: ['OPS', 'AUDITOR'], label: 'Opérations & audit — OPS, AUDITOR' },
]
export const CURRENT_MFA_WAVE = Math.min(
  MFA_WAVES.length,
  Math.max(1, Number(process.env.YAHRIA_MFA_WAVE ?? 3))
)
export const MFA_REQUIRED_ROLES: ReadonlySet<string> = new Set(
  MFA_WAVES.filter((w) => w.wave <= CURRENT_MFA_WAVE).flatMap((w) => w.roles)
)
export function mfaWaveOfRole(role: string): number | null {
  const w = MFA_WAVES.find((x) => x.roles.includes(role))
  return w ? w.wave : null
}

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

// ── Sessions rotatives — implémentation dans sessions.ts ─────────────────────
export interface SessionUser {
  userId: string
  name: string
  email: string
  role: Role
  permissions: string[]
  orgId: string
  tenantId: string
  sessionId: string
  sessionExpiresAt: Date
  totpEnabled: boolean
  mfaRequired: boolean
  org: { name: string; legalName: string; countryCode: string; city: string; currencyCode: string }
  tenant: { name: string; plan: string }
}

export async function createSession(userId: string, userAgent?: string) {
  return createRotatingSession(userId, userAgent)
}

export async function destroySession(token: string) {
  const live = await resolveLiveSession(token)
  if (live) await revokeSessionById(live.userId, live.id, 'LOGOUT')
}

async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  const live = await resolveLiveSession(token)
  if (!live || live.user.status !== 'ACTIVE') return null
  const totpEnabled = live.user.totpEnabledAt != null
  return {
    userId: live.user.id,
    name: live.user.name,
    email: live.user.email,
    role: live.user.role as Role,
    permissions: permissionsOf(live.user.role),
    orgId: live.user.orgId,
    tenantId: live.user.tenantId,
    sessionId: live.id,
    sessionExpiresAt: live.expiresAt,
    totpEnabled,
    mfaRequired: !totpEnabled && MFA_REQUIRED_ROLES.has(live.user.role),
    org: {
      name: live.user.org.name, legalName: live.user.org.legalName, countryCode: live.user.org.countryCode,
      city: live.user.org.city, currencyCode: live.user.org.currencyCode,
    },
    tenant: { name: live.user.tenant.name, plan: live.user.tenant.plan },
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
 * 3. obligation d'enrôlement 2FA pour les rôles des vagues actives — tout ce
 *    qui n'est pas « auth.* » (setup, verify, sessions, me) est verrouillé
 *    (403 MFA_ENROLLMENT_REQUIRED)
 * 4. exécution sous périmètre RLS {tenantId, orgId} — INV-001
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
  // SEC-003 — 2FA obligatoire par vagues de rôles : verrou PAR CONSTRUCTION.
  // Ce n'est PAS la capability qui décide (les routes « null » existent) :
  // seule une WHITELIST explicite de chemins d'authentification reste ouverte.
  const MFA_ALLOWED_PATHS = [
    '/api/v1/auth/me',
    '/api/v1/auth/sessions',
    '/api/v1/auth/session/rotate',
    '/api/v1/auth/2fa/setup',
    '/api/v1/auth/2fa/enable',
    '/api/v1/auth/logout',
  ]
  const path = req.nextUrl.pathname
  const mfaAllowed = MFA_ALLOWED_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
  if (s.mfaRequired && !mfaAllowed) {
    return withContractHeaders(
      NextResponse.json(
        {
          error: 'Double authentification requise — enrôlez la 2FA pour continuer',
          code: 'MFA_ENROLLMENT_REQUIRED',
        },
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

export {
  rotateSession,
  revokeAllForUser,
  revokeSessionById,
  listActiveSessions,
  resolveLiveSession,
} from './sessions'
