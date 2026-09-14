import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/yahria/auth'

export async function GET(req: NextRequest) {
  return withAuth(req, null, async (s) => ({
    user: {
      id: s.userId,
      name: s.name,
      email: s.email,
      role: s.role,
      permissions: s.permissions,
      totpEnabled: s.totpEnabled,
      mfaRequired: s.mfaRequired,
    },
    session: { id: s.sessionId, expiresAt: s.sessionExpiresAt },
    org: s.org,
    tenant: s.tenant,
  }))
}
