// YAHRIA BUSINESS OS V1 — Sessions rotatives (INV-002 durci, §SEC-002)
// Garanties PAR CONSTRUCTION :
//  · TTL glissant   — expiresAt repoussé à chaque activité, plafonné par absoluteExpiresAt
//  · Rotation       — chaque rotation crée un nouveau token dans la même famille
//                     (tokenFamily) ; l'ancien token devient inutilisable
//  · Détection de   — rejouer un token déjà rotaté déclenche la révocation de
//    réutilisation    TOUTE la famille (attaque par vol de cookie neutralisée)
//  · Révocation     — logout, logout-all, révocation admin ; effet immédiat
import { randomBytes } from 'node:crypto'
import { dbUnscoped } from '@/lib/db'
import { audit } from './audit'

export const SLIDING_TTL_MS = 7 * 24 * 3600 * 1000 // 7 jours d'inactivité max
export const ABSOLUTE_TTL_MS = 30 * 24 * 3600 * 1000 // plafond absolu : 30 jours
const REFRESH_THROTTLE_MS = 5 * 60 * 1000 // écriture DB throttlée (1x / 5 min max)

export type RevokeReason = 'LOGOUT' | 'ROTATION_REPLAY' | 'ADMIN_REVOKE' | 'BULK_REVOKE' | 'PASSWORD_CHANGED'

export interface LiveSession {
  id: string
  token: string
  userId: string
  tokenFamily: string
  expiresAt: Date
  absoluteExpiresAt: Date
  user: {
    id: string
    name: string
    email: string
    role: string
    status: string
    tenantId: string
    orgId: string
    totpEnabledAt: Date | null
    org: { name: string; legalName: string; countryCode: string; city: string; currencyCode: string }
    tenant: { name: string; plan: string }
  }
}

/** Crée une session avec famille de rotation + TTL glissant + plafond absolu. */
export async function createSession(
  userId: string,
  userAgent?: string
): Promise<{ token: string; expiresAt: Date; tokenFamily: string }> {
  const token = randomBytes(32).toString('hex')
  const tokenFamily = randomBytes(16).toString('hex')
  const now = Date.now()
  const expiresAt = new Date(now + SLIDING_TTL_MS)
  const absoluteExpiresAt = new Date(now + ABSOLUTE_TTL_MS)
  await dbUnscoped.session.create({
    data: { token, userId, tokenFamily, userAgent: userAgent ?? null, expiresAt, absoluteExpiresAt },
  })
  return { token, expiresAt, tokenFamily }
}

/** Révoque toute la famille de tokens (détection de réutilisation / compromission). */
export async function revokeFamily(family: string, reason: RevokeReason) {
  const r = await dbUnscoped.session.updateMany({
    where: { tokenFamily: family, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  })
  return r.count
}

/** Révoque toutes les sessions actives d'un utilisateur (logout-all, admin). */
export async function revokeAllForUser(userId: string, reason: RevokeReason) {
  const r = await dbUnscoped.session.updateMany({
    where: { userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date(), revokedReason: reason },
  })
  return r.count
}

/**
 * Résolution live d'une session avec :
 *  1. refus si révoquée / expirée (glissant ou absolu)
 *  2. DÉTECTION DE RÉUTILISATION : token déjà rotaté → révocation familiale + audit
 *  3. TTL glissant throttlé (l'activité repousse expiresAt, jamais au-delà du plafond)
 * Retourne null si la session est invalide. Ne lève jamais — les routes
 * d'authentification ne doivent pas casser sur une session morte.
 */
export async function resolveLiveSession(token: string | undefined): Promise<LiveSession | null> {
  if (!token) return null
  const s = await dbUnscoped.session.findUnique({
    where: { token },
    include: {
      user: {
        include: { org: true, tenant: true },
      },
    },
  })
  if (!s) return null
  const now = new Date()
  // Sessions héritées (pré-rotation) : champs null-safe — plafond absolu retombe
  // sur expiresAt, dernier accès sur createdAt. Les nouvelles sessions sont
  // toujours créées avec les deux champs explicites.
  const lastSeen = s.lastSeenAt ?? s.createdAt ?? now
  const absoluteExpiry = s.absoluteExpiresAt ?? s.expiresAt

  // 1. Session révoquée ou expirée
  if (s.revokedAt) return null
  if (s.expiresAt < now || absoluteExpiry < now) return null

  // 2. RÉUTILISATION D'UN TOKEN ROTATÉ — replay d'un ancien cookie.
  //    Politique : la famille entière est compromise → révocation totale.
  if (s.rotatedAt) {
    const count = await revokeFamily(s.tokenFamily ?? s.id, 'ROTATION_REPLAY')
    await audit({
      orgId: s.user.orgId,
      actorType: 'SYSTEM',
      actorId: 'session-guard',
      actorName: 'Session Guard',
      action: 'SESSION_REUSE_DETECTED',
      resourceType: 'SESSION',
      resourceId: s.id,
      summary: `Réutilisation d'un token rotaté détectée — famille « ${(s.tokenFamily ?? s.id).slice(0, 8)}… » révoquée (${count} session${count > 1 ? 's' : ''}), utilisateur ${s.user.email}. Vol de cookie suspecté.`,
    }).catch(() => {})
    return null
  }

  // 3. TTL glissant — throttle : on ne réécrit la DB qu'au plus toutes les 5 min.
  //    Le glissement ne dépasse JAMAIS absoluteExpiresAt.
  if (now.getTime() - lastSeen.getTime() > REFRESH_THROTTLE_MS) {
    const nextExpiry = new Date(Math.min(now.getTime() + SLIDING_TTL_MS, absoluteExpiry.getTime()))
    await dbUnscoped.session
      .update({ where: { id: s.id }, data: { lastSeenAt: now, expiresAt: nextExpiry } })
      .catch(() => {})
    s.expiresAt = nextExpiry
  }

  return {
    id: s.id,
    token: s.token,
    userId: s.userId,
    tokenFamily: s.tokenFamily ?? s.id,
    expiresAt: s.expiresAt,
    absoluteExpiresAt: absoluteExpiry,
    user: {
      id: s.user.id,
      name: s.user.name,
      email: s.user.email,
      role: s.user.role,
      status: s.user.status,
      tenantId: s.user.tenantId,
      orgId: s.user.orgId,
      totpEnabledAt: s.user.totpEnabledAt,
      org: {
        name: s.user.org.name,
        legalName: s.user.org.legalName,
        countryCode: s.user.org.countryCode,
        city: s.user.org.city,
        currencyCode: s.user.org.currencyCode,
      },
      tenant: { name: s.user.tenant.name, plan: s.user.tenant.plan },
    },
  }
}

/**
 * Rotation : le token courant est remplacé par un nouveau token de la même
 * famille. L'ancien token est marqué rotaté — tout rejeu ultérieur déclenchera
 * la révocation familiale (voir resolveLiveSession).
 */
export async function rotateSession(
  current: LiveSession,
  userAgent?: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(Math.min(now.getTime() + SLIDING_TTL_MS, current.absoluteExpiresAt.getTime()))
  await dbUnscoped.$transaction([
    dbUnscoped.session.create({
      data: {
        token,
        userId: current.userId,
        tokenFamily: current.tokenFamily,
        userAgent: userAgent ?? null,
        lastSeenAt: now,
        expiresAt,
        absoluteExpiresAt: current.absoluteExpiresAt,
      },
    }),
    dbUnscoped.session.update({
      where: { id: current.id },
      data: { rotatedAt: now, rotatedToToken: token, lastSeenAt: now },
    }),
  ])
  await audit({
    orgId: current.user.orgId,
    actorType: 'HUMAN',
    actorId: current.userId,
    actorName: current.user.name,
    action: 'SESSION_ROTATED',
    resourceType: 'SESSION',
    resourceId: current.id,
    summary: `Rotation de session pour ${current.user.email} — nouveau token émis, l'ancien devient un piège à rejeu.`,
  }).catch(() => {})
  return { token, expiresAt }
}

/** Sessions actives d'un utilisateur (pour le panneau sécurité). */
export async function listActiveSessions(userId: string) {
  const rows = await dbUnscoped.session.findMany({
    where: { userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() }, absoluteExpiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
  })
  return rows.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt ?? s.createdAt,
    expiresAt: s.expiresAt,
    absoluteExpiresAt: s.absoluteExpiresAt ?? s.expiresAt,
    current: false, // repositionné par la route appelante
  }))
}

export async function revokeSessionById(userId: string, sessionId: string, reason: RevokeReason) {
  const r = await dbUnscoped.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  })
  return r.count
}
