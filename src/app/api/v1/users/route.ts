import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, hashPassword, permissionsOf } from '@/lib/yahria/auth'
import { audit } from '@/lib/yahria/audit'

const ROLES = ['OWNER', 'ADMIN', 'CFO', 'ACCOUNTANT', 'OPS', 'AUDITOR']

export async function GET(req: NextRequest) {
  return withAuth(req, 'users.read', async () => {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true, createdAt: true, org: { select: { name: true, countryCode: true } } },
    })
    return { users: users.map((u) => ({ ...u, permissions: permissionsOf(u.role).length })) }
  })
}

export async function POST(req: NextRequest) {
  return withAuth(req, 'users.manage', async (s) => {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const role = String(body.role ?? 'OPS').toUpperCase()
    const password = String(body.password ?? '')
    if (!name || !email || !password) throw new Error('Nom, email et mot de passe requis')
    if (!ROLES.includes(role)) throw new Error(`Rôle invalide — rôles : ${ROLES.join(', ')}`)
    if (password.length < 8) throw new Error('Mot de passe : 8 caractères minimum')

    const exists = await dbUnscopedCheck(email)
    if (exists) throw new Error('Cet email est déjà utilisé')

    const user = await db.user.create({
      data: { tenantId: s.tenantId, orgId: s.orgId, email, name, role, passwordHash: hashPassword(password) },
      select: { id: true, name: true, email: true, role: true, status: true },
    })
    await audit({
      orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
      action: 'USER_CREATED', resourceType: 'USER', resourceId: user.id,
      summary: `Création du compte ${user.name} (${user.role}) par ${s.name}`,
    })
    return { user }
  })
}

export async function PATCH(req: NextRequest) {
  return withAuth(req, 'users.manage', async (s) => {
    const body = await req.json()
    if (!body.id) throw new Error('id requis')
    const target = await db.user.findUnique({ where: { id: String(body.id) } })
    if (!target) throw new Error('Utilisateur introuvable')

    const data: { role?: string; status?: string } = {}
    if (body.role) {
      const role = String(body.role).toUpperCase()
      if (!ROLES.includes(role)) throw new Error('Rôle invalide')
      if (target.id === s.userId && role !== 'OWNER') throw new Error('Impossible de retirer son propre rôle OWNER')
      data.role = role
    }
    if (body.status) {
      const status = String(body.status).toUpperCase()
      if (!['ACTIVE', 'SUSPENDED'].includes(status)) throw new Error('Statut invalide')
      if (target.id === s.userId && status === 'SUSPENDED') throw new Error('Impossible de suspendre son propre compte')
      data.status = status
    }
    const user = await db.user.update({ where: { id: target.id }, data, select: { id: true, name: true, role: true, status: true } })
    await audit({
      orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
      action: 'USER_UPDATED', resourceType: 'USER', resourceId: user.id,
      summary: `Compte ${user.name} modifié (${[data.role && `rôle→${data.role}`, data.status && `statut→${data.status}`].filter(Boolean).join(', ')}) par ${s.name}`,
    })
    return { user }
  })
}

/** Vérification d'unicité email hors périmètre RLS (les emails sont globalement uniques). */
async function dbUnscopedCheck(email: string): Promise<boolean> {
  const { dbUnscoped } = await import('@/lib/db')
  const found = await dbUnscoped.user.findUnique({ where: { email }, select: { id: true } })
  return !!found
}
