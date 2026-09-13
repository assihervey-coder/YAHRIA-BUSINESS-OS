// YAHRIA BUSINESS OS V1 — 2FA TOTP : vérification de connexion (étape 2)
// Reçoit {challenge, code} — le défi signé émis par /auth/login. Accepte un
// code TOTP ou un code de récupération (usage unique). Crée la session.
import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { createSession, setSessionCookie } from '@/lib/yahria/auth'
import { verifyMfaChallenge, verifyTotp, consumeRecoveryCode, type RecoveryCode } from '@/lib/yahria/totp'
import { ensureSeeded } from '@/lib/yahria/seed'
import { audit } from '@/lib/yahria/audit'

export async function POST(req: NextRequest) {
  await ensureSeeded()
  const body = await req.json().catch(() => ({}))
  const challenge = String(body.challenge ?? '')
  const code = String(body.code ?? '').trim()
  if (!challenge || !code) {
    return NextResponse.json({ error: 'Défi et code requis' }, { status: 400 })
  }
  const userId = verifyMfaChallenge(challenge)
  if (!userId) {
    return NextResponse.json({ error: 'Défi invalide ou expiré — reconnectez-vous' }, { status: 401 })
  }
  const user = await dbUnscoped.user.findUnique({
    where: { id: userId },
    include: { org: true, tenant: true },
  })
  if (!user || user.status !== 'ACTIVE' || !user.totpEnabledAt || !user.totpSecret) {
    return NextResponse.json({ error: 'Compte non éligible à la 2FA' }, { status: 403 })
  }

  let viaRecovery = false
  if (!verifyTotp(user.totpSecret, code)) {
    // Repli : code de récupération à usage unique
    let codes: RecoveryCode[] = []
    try {
      codes = JSON.parse(user.recoveryCodes ?? '[]') as RecoveryCode[]
    } catch {
      codes = []
    }
    if (!consumeRecoveryCode(codes, code)) {
      return NextResponse.json({ error: 'Code invalide' }, { status: 401 })
    }
    await dbUnscoped.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(codes) } })
    viaRecovery = true
  }

  const { token, expiresAt } = await createSession(user.id, req.headers.get('user-agent') ?? undefined)
  await dbUnscoped.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await audit({
    orgId: user.orgId,
    actorType: 'HUMAN',
    actorId: user.id,
    actorName: user.name,
    action: 'USER_LOGIN_MFA',
    resourceType: 'SESSION',
    summary: `Connexion 2FA de ${user.name} (${user.role})${viaRecovery ? ' — via code de récupération' : ''}.`,
  })

  const res = NextResponse.json({
    ok: true,
    user: { name: user.name, email: user.email, role: user.role, org: user.org.legalName, tenant: user.tenant.name },
    viaRecovery,
  })
  return setSessionCookie(res, token, expiresAt)
}
