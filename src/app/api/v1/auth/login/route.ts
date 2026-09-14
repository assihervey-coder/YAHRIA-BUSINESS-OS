import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie, SESSION_COOKIE, MFA_REQUIRED_ROLES } from '@/lib/yahria/auth'
import { issueMfaChallenge, totpAt } from '@/lib/yahria/totp'
import { isDemoAssist, isDemo2faOff, totpRemainingSeconds } from '@/lib/yahria/demo'
import { ensureSeeded } from '@/lib/yahria/seed'
import { audit } from '@/lib/yahria/audit'

export async function POST(req: NextRequest) {
  await ensureSeeded()
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  const user = await dbUnscoped.user.findUnique({
    where: { email },
    include: { org: true, tenant: true },
  })
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 })
  }
  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Compte suspendu — contactez votre administrateur' }, { status: 403 })
  }

  // Étape 2 (SEC-003) — 2FA activée : pas de session tant que le code TOTP
  // n'est pas validé. Un défi signé (5 min, usage unique) relie les deux étapes.
  // Mode démo « off » : la 2FA est court-circuitée (connexion mot de passe seul).
  if (!isDemo2faOff() && user.totpEnabledAt && user.totpSecret) {
    const { challenge, expiresIn } = issueMfaChallenge(user.id)
    // Mode démo « assist » : le code TOTP courant est retourné à l'UI pour
    // affichage/auto-remplissage (environnement de démonstration uniquement).
    const demoAssist = isDemoAssist()
      ? { code: totpAt(user.totpSecret), period: 30, remainingSec: totpRemainingSeconds() }
      : undefined
    return NextResponse.json({ mfaRequired: true, challenge, expiresIn, demoAssist })
  }

  const { token, expiresAt } = await createSession(user.id, req.headers.get('user-agent') ?? undefined)
  await dbUnscoped.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await audit({
    orgId: user.orgId,
    actorType: 'HUMAN',
    actorId: user.id,
    actorName: user.name,
    action: 'USER_LOGIN',
    resourceType: 'SESSION',
    summary: `Connexion de ${user.name} (${user.role}) — ${user.tenant.name}`,
  })

  // SEC-003 — parcours « 2FA AVANT la plateforme » : si le compte relève d'une
  // vague active sans enrôlement, la session émise est PROVISIONNELLE (côté
  // serveur, withAuth ne laisse ouverte que la whitelist d'authentification).
  // L'UI termine l'enrôlement SUR LA PAGE DE CONNEXION — aucune navigation
  // vers /app n'est autorisée avant que la 2FA soit réellement validée.
  const mfaEnrollmentRequired = !isDemo2faOff() && MFA_REQUIRED_ROLES.has(user.role)
  const res = NextResponse.json({
    ok: true,
    mfaEnrollmentRequired,
    user: { name: user.name, email: user.email, role: user.role, org: user.org.legalName, tenant: user.tenant.name },
  })
  return setSessionCookie(res, token, expiresAt)
}
