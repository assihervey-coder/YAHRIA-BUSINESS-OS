// YAHRIA BUSINESS OS V1 — Registre sectoriel (INV-012 Sector Isolation)
// Le registre est LA SEULE SURFACE PUBLIQUE des extensions sectorielles :
//   · le Core et les routes API n'importent JAMAIS './extensions' directement —
//     ils passent par listSectors() / getSector() / evaluateSectorPayment() ;
//   · une extension n'importe jamais le Core (contrôle structurel : vérifié
//     par le scanner de frontières des invariants par construction) ;
//   · les hooks sont des fonctions pures → une extension ne peut pas créer
//     d'effet de bord dans le noyau (pas de base, pas d'I/O, pas d'état).

import { SECTOR_CONTRACT_VERSION, type SectorExtension, type SectorPaymentContext, type SectorFinding } from './contract'
import { SECTOR_EXTENSIONS } from './extensions'

const REGISTRY: ReadonlyMap<string, SectorExtension> = new Map(
  SECTOR_EXTENSIONS.map((e) => [e.code, e])
)

export { SECTOR_CONTRACT_VERSION }
export type { SectorExtension, SectorPaymentContext, SectorFinding }

export function getSector(code: string): SectorExtension | null {
  return REGISTRY.get(code?.toLowerCase?.() ?? '') ?? null
}

export function listSectors(): SectorExtension[] {
  return [...SECTOR_EXTENSIONS]
}

export function registryIntegrity(): { total: number; contractVersion: string; versionsOk: boolean; codes: string[] } {
  const codes = listSectors().map((e) => e.code)
  const versionsOk = SECTOR_EXTENSIONS.every((e) => e.contractVersion === SECTOR_CONTRACT_VERSION)
  return { total: REGISTRY.size, contractVersion: SECTOR_CONTRACT_VERSION, versionsOk, codes }
}

/**
 * Surface d'invocation unique des hooks sectoriels — utilisée par la couche
 * route (composition), jamais par le Core. Un hook absent → aucun constat.
 * Toute erreur d'une extension est confinée et ne peut pas casser le noyau.
 */
export function evaluateSectorPayment(sectorCode: string, ctx: Omit<SectorPaymentContext, 'sectorCode'>): SectorFinding[] {
  const code = (sectorCode ?? '').toLowerCase()
  const ext = REGISTRY.get(code)
  if (!ext?.evaluatePayment) return []
  try {
    return ext.evaluatePayment({ ...ctx, sectorCode: code }) ?? []
  } catch {
    return [ { code: 'SECTOR_HOOK_ERROR', severity: 'INFO', note: `Extension ${sectorCode} : hook en erreur — constats ignorés (confinement)` } ]
  }
}
