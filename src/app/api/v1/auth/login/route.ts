import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie, SESSION_COOKIE } from '@/lib/yahria/auth'
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

  const res = NextResponse.json({
    ok: true,
    user: { name: user.name, email: user.email, role: user.role, org: user.org.legalName, tenant: user.tenant.name },
  })
  return setSessionCookie(res, token, expiresAt)
}
