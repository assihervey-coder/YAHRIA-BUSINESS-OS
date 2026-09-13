// YAHRIA BUSINESS OS V1 — Rotation explicite de session (SEC-002)
// Échange le cookie courant contre un nouveau token de la même famille.
// L'ancien token devient un piège : tout rejeu → révocation familiale.
import { NextRequest, NextResponse } from 'next/server'
import { resolveLiveSession, rotateSession, SESSION_COOKIE, setSessionCookie } from '@/lib/yahria/auth'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const live = await resolveLiveSession(token)
  if (!live) {
    return NextResponse.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }
  const { token: newToken, expiresAt } = await rotateSession(live, req.headers.get('user-agent') ?? undefined)
  const res = NextResponse.json({ ok: true, expiresAt })
  return setSessionCookie(res, newToken, expiresAt)
}
