import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { jparse } from './core'

// YAHRIA BUSINESS OS V1 — Country Pack isolation (INV-011)
// Les rails de paiement autorisés proviennent EXCLUSIVEMENT du Country Pack
// national de l'organisation : une org du Bénin ne peut pas exécuter via un
// rail ivoirien (et inversement). Les règles nationales restent encapsulées.

export interface PackIsolationResult {
  ok: boolean
  countryCode: string | null
  packName: string | null
  allowedProviders: string[]
  detail: string
}

const UNIVERSAL = ['CAISSE'] // espèces : rail universel

export async function checkPackIsolation(orgId: string, provider: string | null | undefined): Promise<PackIsolationResult> {
  const org = await dbUnscoped.organization.findUnique({ where: { id: orgId } })
  if (!org) return { ok: false, countryCode: null, packName: null, allowedProviders: [], detail: 'Organisation introuvable' }

  const pack = await dbUnscoped.countryPack.findUnique({ where: { code: org.countryCode } })
  const mm = jparse<{ provider: string }[]>(pack?.mobileMoneyJson, [])
  const banks = jparse<{ provider: string }[]>(pack?.banksJson, [])
  const allowed = [...new Set([...mm.map((p) => p.provider), ...banks.map((p) => p.provider), ...UNIVERSAL])]

  if (!provider) {
    return { ok: true, countryCode: org.countryCode, packName: pack?.name ?? org.countryCode, allowedProviders: allowed, detail: 'Aucun rail explicite — routage interne' }
  }
  if (allowed.includes(provider)) {
    return { ok: true, countryCode: org.countryCode, packName: pack?.name ?? org.countryCode, allowedProviders: allowed, detail: `Rail ${provider} ∈ pack ${pack?.name ?? org.countryCode} (INV-011 OK)` }
  }
  return {
    ok: false,
    countryCode: org.countryCode,
    packName: pack?.name ?? org.countryCode,
    allowedProviders: allowed,
    detail: `INV-011 : rail « ${provider} » hors du Country Pack ${pack?.name ?? org.countryCode} — rails autorisés : ${allowed.join(', ')}`,
  }
}

/** Un rail est exécutable seulement si l'isolation l'autorise. */
export function packProviderAllowed(result: PackIsolationResult): boolean {
  return result.ok
}
