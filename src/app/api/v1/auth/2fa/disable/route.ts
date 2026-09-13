// YAHRIA BUSINESS OS V1 — 2FA TOTP : désactivation (mot de passe requis)
// Pour OWNER/CFO, la désactivation ré-enclenche immédiatement le verrou
// d'enrôlement (PAR CONSTRUCTION) — l'accès applicatif redevient restreint.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, verifyPassword } from '@/lib/yahria/auth'
import { dbUnscoped } from '@/lib/db'
import { audit } from '@/lib/yahria/audit'

export async function POST(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const body = await req.json().catch(() => ({}))
    const password = String(body.password ?? '')
    const user = await dbUnscoped.user.findUnique({ where: { id: s.userId } })
    if (!user) throw new Error('Utilisateur introuvable')
    if (!user.totpEnabledAt) throw new Error('La 2FA n\u2019est pas activée')
    if (!verifyPassword(password, user.passwordHash)) {
      throw new Error('Mot de passe incorrect')
    }
    await dbUnscoped.user.update({
      where: { id: s.userId },
      data: { totpSecret: null, totpEnabledAt: null, recoveryCodes: null },
    })
    await audit({
      orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
      action: 'MFA_DISABLED', resourceType: 'USER', resourceId: s.userId,
      summary: `2FA désactivée pour ${s.email} (${s.role})${['OWNER', 'CFO'].includes(s.role) ? ' — accès restreint jusqu\u2019au ré-enrôlement' : ''}.`,
    }).catch(() => {})
    return { ok: true }
  })
}
