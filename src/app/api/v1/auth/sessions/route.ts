// YAHRIA BUSINESS OS V1 — Panneau sécurité : sessions actives du user courant
// GET    → liste des sessions actives (la session courante marquée)
// DELETE → révocation ciblée { id } ou « toutes les autres » { all: true }
// Ownership strict : un utilisateur ne voit/ne révoque QUE ses sessions.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, listActiveSessions, revokeSessionById, revokeAllForUser } from '@/lib/yahria/auth'
import { audit } from '@/lib/yahria/audit'

export async function GET(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const sessions = await listActiveSessions(s.userId)
    return { sessions: sessions.map((x) => ({ ...x, current: x.id === s.sessionId })) }
  })
}

export async function DELETE(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    const body = await req.json().catch(() => ({}))
    if (body.all) {
      const n = await revokeAllForUser(s.userId, 'BULK_REVOKE')
      await audit({
        orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
        action: 'SESSIONS_BULK_REVOKED', resourceType: 'SESSION',
        summary: `${s.name} a révoqué toutes ses autres sessions (${n}).`,
      })
      return { revoked: n, ok: true }
    }
    const id = String(body.id ?? '')
    if (!id) throw new Error('id requis')
    if (id === s.sessionId) throw new Error('Impossible de révoquer la session courante — utilisez « Déconnexion »')
    const n = await revokeSessionById(s.userId, id, 'ADMIN_REVOKE')
    if (!n) throw new Error('Session introuvable ou déjà révoquée')
    await audit({
      orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
      action: 'SESSION_REVOKED', resourceType: 'SESSION', resourceId: id,
      summary: `${s.name} a révoqué une session de son compte.`,
    })
    return { revoked: n, ok: true }
  })
}
