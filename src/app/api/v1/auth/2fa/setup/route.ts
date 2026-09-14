// YAHRIA BUSINESS OS V1 — 2FA TOTP : enrôlement (étape 1)
// Génère le secret TOTP + QR code. L'enrôlement n'est actif qu'après
// /2fa/enable avec un code valide (totpEnabledAt).
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/yahria/auth'
import { dbUnscoped } from '@/lib/db'
import { generateTotpSecret, otpauthUrl } from '@/lib/yahria/totp'
import QRCode from 'qrcode'
import { audit } from '@/lib/yahria/audit'

export async function POST(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const user = await dbUnscoped.user.findUnique({ where: { id: s.userId } })
    if (!user) throw new Error('Utilisateur introuvable')
    if (user.totpEnabledAt) throw new Error('La 2FA est déjà activée sur ce compte')

    const secret = generateTotpSecret()
    await dbUnscoped.user.update({ where: { id: s.userId }, data: { totpSecret: secret } })
    const otpauth = otpauthUrl(secret, user.email)
    const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 240, margin: 1 })
    await audit({
      orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
      action: 'MFA_SETUP_STARTED', resourceType: 'USER', resourceId: s.userId,
      summary: `Enrôlement 2FA démarré pour ${s.email}.`,
    }).catch(() => {})
    return { secret, otpauth, qrDataUrl }
  })
}

export function GET() {
  return NextResponse.json({ error: 'Méthode non supportée — utilisez POST' }, { status: 405 })
}
