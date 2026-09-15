// YAHRIA BUSINESS OS V1 — Registre sectoriel VERSIONNÉ (INV-012 / INV-013)
// Le registre est LA SEULE SURFACE PUBLIQUE des extensions sectorielles :
//   · le Core et les routes API n'importent JAMAIS './extensions' directement —
//     ils passent par listSectors() / getSector() / evaluateSector*() ;
//   · une extension n'importe jamais le Core (contrôle structurel : vérifié
//     par le scanner de frontières des invariants par construction) ;
//   · les hooks sont des fonctions pures → une extension ne peut pas créer
//     d'effet de bord dans le noyau (pas de base, pas d'I/O, pas d'état) ;
//   · NÉGOCIATION DE VERSION (INV-013) : une extension est enregistrée
//     seulement si son contractVersion ∈ SUPPORTED_CONTRACT_VERSIONS. Les
//     extensions v1 et v2 coexistent ; toute version inconnue est REFUSÉE
//     et signalée dans registryIntegrity().refused.

import {
  SECTOR_CONTRACT_VERSION, SUPPORTED_CONTRACT_VERSIONS, SECTOR_CONTRACT_VERSIONS,
  isContractVersionAccepted,
  type SectorExtension, type SectorPaymentContext, type SectorInvoiceContext,
  type SectorPayrollContext, type SectorFinding, type SectorContractRelease,
} from './contract'
import { SECTOR_EXTENSIONS } from './extensions'

const REGISTRY: ReadonlyMap<string, SectorExtension> = new Map(
  SECTOR_EXTENSIONS
    .filter((e) => isContractVersionAccepted(e.contractVersion))
    .map((e) => [e.code, e])
)

/** Extensions REFUSÉES à l'enregistrement (version de contrat non supportée). */
const REFUSED: ReadonlyArray<{ code: string; contractVersion: string }> = SECTOR_EXTENSIONS
  .filter((e) => !isContractVersionAccepted(e.contractVersion))
  .map((e) => ({ code: e.code, contractVersion: e.contractVersion }))

export { SECTOR_CONTRACT_VERSION, SUPPORTED_CONTRACT_VERSIONS }
export type { SectorExtension, SectorPaymentContext, SectorInvoiceContext, SectorPayrollContext, SectorFinding }

export function getSector(code: string): SectorExtension | null {
  return REGISTRY.get(code?.toLowerCase?.() ?? '') ?? null
}

export function listSectors(): SectorExtension[] {
  return SECTOR_EXTENSIONS.filter((e) => REGISTRY.has(e.code))
}

/**
 * Négociation de contrat (INV-013) : un consommateur déclare la version qu'il
 * sait parler ; le registre indique si elle est servable, quelle est la
 * courante et quelles sont les migrations. Jamais silencieux : une version
 * inconnue est explicitement refusée.
 */
export function negotiateContract(requested: string): {
  requested: string; accepted: boolean; current: string; supported: readonly string[]
  release: SectorContractRelease | null
} {
  const accepted = isContractVersionAccepted(requested)
  return {
    requested,
    accepted,
    current: SECTOR_CONTRACT_VERSION,
    supported: SUPPORTED_CONTRACT_VERSIONS,
    release: accepted ? (SECTOR_CONTRACT_VERSIONS[requested.trim() as keyof typeof SECTOR_CONTRACT_VERSIONS] ?? null) : null,
  }
}

export interface RegistryIntegrity {
  total: number
  contractVersion: string
  versionsOk: boolean
  codes: string[]
  /** Répartition des extensions par version de contrat (coexistence v1/v2). */
  byContractVersion: Record<string, number>
  /** Extensions refusées à l'enregistrement (version inconnue). */
  refused: ReadonlyArray<{ code: string; contractVersion: string }>
  /** Couverture des hooks optionnels v2 (combien d'extensions les implémentent). */
  hooksCoverage: Record<string, number>
}

export function registryIntegrity(): RegistryIntegrity {
  const kept = listSectors()
  const codes = kept.map((e) => e.code)
  const byContractVersion: Record<string, number> = {}
  for (const e of kept) byContractVersion[e.contractVersion] = (byContractVersion[e.contractVersion] ?? 0) + 1
  const hooksCoverage: Record<string, number> = {}
  for (const e of kept) for (const h of ['evaluatePayment', 'evaluateInvoice', 'evaluatePayroll']) if (typeof (e as unknown as Record<string, unknown>)[h] === 'function') hooksCoverage[h] = (hooksCoverage[h] ?? 0) + 1
  const versionsOk = kept.every((e) => isContractVersionAccepted(e.contractVersion))
  return {
    total: REGISTRY.size,
    contractVersion: SECTOR_CONTRACT_VERSION,
    versionsOk,
    codes,
    byContractVersion,
    refused: REFUSED,
    hooksCoverage,
  }
}

// ── Surface d'invocation unique des hooks sectoriels ────────────────────────
// Utilisée par la couche route (composition), jamais par le Core. Un hook
// absent → aucun constat (une extension v1 n'implémente pas les hooks v2 —
// c'est la coexistence PAR CONSTRUCTION). Toute erreur d'une extension est
// confinée et ne peut pas casser le noyau.
function confined(code: string, hook: string, ctx: unknown): SectorFinding[] {
  const ext = REGISTRY.get((code ?? '').toLowerCase())
  const fn = (ext as unknown as Record<string, ((c: never) => SectorFinding[]) | undefined> | undefined)?.[hook]
  if (!ext || typeof fn !== 'function') return []
  try {
    return fn(ctx as never) ?? []
  } catch {
    return [ { code: 'SECTOR_HOOK_ERROR', severity: 'INFO', note: `Extension ${code} : hook ${hook} en erreur — constats ignorés (confinement)` } ]
  }
}

export function evaluateSectorPayment(sectorCode: string, ctx: Omit<SectorPaymentContext, 'sectorCode'>): SectorFinding[] {
  return confined(sectorCode, 'evaluatePayment', { ...ctx, sectorCode: (sectorCode ?? '').toLowerCase() })
}

export function evaluateSectorInvoice(sectorCode: string, ctx: Omit<SectorInvoiceContext, 'sectorCode'>): SectorFinding[] {
  return confined(sectorCode, 'evaluateInvoice', { ...ctx, sectorCode: (sectorCode ?? '').toLowerCase() })
}

export function evaluateSectorPayroll(sectorCode: string, ctx: Omit<SectorPayrollContext, 'sectorCode'>): SectorFinding[] {
  return confined(sectorCode, 'evaluatePayroll', { ...ctx, sectorCode: (sectorCode ?? '').toLowerCase() })
}
