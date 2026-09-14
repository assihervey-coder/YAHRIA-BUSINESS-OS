// YAHRIA BUSINESS OS V1 — 2FA TOTP : activation (étape 2 de l'enrôlement)
// Vérifie un premier code valide contre le secret en attente, active la 2FA
// et délivre les codes de récupération (affichés UNE SEULE FOIS).
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/yahria/auth'
import { dbUnscoped } from '@/lib/db'
import { verifyTotp, generateRecoveryCodes } from '@/lib/yahria/totp'
import { audit } from '@/lib/yahria/audit'

export async function POST(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const body = await req.json().catch(() => ({}))
    const code = String(body.code ?? '')
    const user = await dbUnscoped.user.findUnique({ where: { id: s.userId } })
    if (!user?.totpSecret) throw new Error('Aucun enrôlement en cours — appelez /2fa/setup d\u2019abord')
    if (user.totpEnabledAt) throw new Error('La 2FA est déjà activée')
    if (!verifyTotp(user.totpSecret, code)) {
      throw new Error('Code invalide — vérifiez l\u2019heure de votre application authentificatrice')
    }

    const { plain, hashed } = generateRecoveryCodes(8)
    await dbUnscoped.user.update({
      where: { id: s.userId },
      data: { totpEnabledAt: new Date(), recoveryCodes: JSON.stringify(hashed) },
    })
    await audit({
      orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
      action: 'MFA_ENABLED', resourceType: 'USER', resourceId: s.userId,
      summary: `2FA TOTP activée pour ${s.email} (${s.role}) — 8 codes de récupération générés.`,
    }).catch(() => {})
    return { ok: true, recoveryCodes: plain }
  })
}
