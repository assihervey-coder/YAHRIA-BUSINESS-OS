import { NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { ensureSeeded, DEMO_PASSWORD } from '@/lib/yahria/seed'
import { ROLE_LABELS, type Role } from '@/lib/yahria/auth'

// Liste publique des comptes de démonstration (mode démo uniquement —
// pas de secret : le mot de passe de démo est affiché sur la page de login).
export async function GET() {
  await ensureSeeded()
  const users = await dbUnscoped.user.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ tenantId: 'asc' }, { role: 'asc' }],
    select: { name: true, email: true, role: true, tenant: { select: { name: true } }, org: { select: { legalName: true, countryCode: true } } },
  })
  return NextResponse.json({
    demoPassword: DEMO_PASSWORD,
    accounts: users.map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      roleLabel: ROLE_LABELS[u.role as Role] ?? u.role,
      org: u.org.legalName,
      country: u.org.countryCode,
      tenant: u.tenant.name,
    })),
  })
}
