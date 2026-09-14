// YAHRIA BUSINESS OS V1 — 2FA : assistance MODE DÉMO (SEC-003 · demo.ts)
// Retourne le code TOTP COURANT du demandeur, UNIQUEMENT quand
// YAHRIA_DEMO_2FA=assist (environnement de démonstration). Utilisée :
//  · pendant l'enrôlement (mur MFA) — le présentateur n'a pas d'app authenticator ;
//  · par le panneau Sécurité pour remplir le code de vérification.
// En 'strict' (production) la route répond 403 : aucune fuite de code possible.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/yahria/auth'
import { dbUnscoped } from '@/lib/db'
import { totpAt } from '@/lib/yahria/totp'
import { isDemoAssist, totpRemainingSeconds } from '@/lib/yahria/demo'

export async function POST(req: NextRequest) {
  return withAuth(req, null, async (s) => {
    if (!isDemoAssist()) {
      throw new Error("Assistance démo désactivée — YAHRIA_DEMO_2FA n'est pas 'assist'")
    }
    const user = await dbUnscoped.user.findUnique({ where: { id: s.userId } })
    if (!user?.totpSecret) {
      throw new Error('Aucun secret TOTP — démarrez la configuration 2FA')
    }
    return {
      code: totpAt(user.totpSecret),
      period: 30,
      remainingSec: totpRemainingSeconds(),
    }
  })
}

export function GET() {
  return NextResponse.json({ error: 'Méthode non supportée — utilisez POST' }, { status: 405 })
}
