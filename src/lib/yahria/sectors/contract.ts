// YAHRIA BUSINESS OS V1 — Contrat sectoriel public (INV-012 / INV-013)
// Ce fichier définit LE contrat auquel toute extension sectorielle doit se
// conformer. Il n'importe AUCUN module du Core : la dépendance va toujours du
// registre vers le contrat, jamais du Core vers une extension concrète.

export const SECTOR_CONTRACT_VERSION = '1.0.0'

/** Contexte d'évaluation transmis aux hooks (données dérivées, sans accès base). */
export interface SectorPaymentContext {
  sectorCode: string
  countryCode: string
  amount: number
  currency: string
  provider: string | null
  direction: 'IN' | 'OUT' | 'INTERNAL'
  counterpartyType: string | null
}

/** Constat sectoriel purement consultatif — jamais bloquant (le Policy Engine du Core reste seul décisionnaire). */
export interface SectorFinding {
  code: string
  severity: 'INFO' | 'WARN'
  note: string
}

export interface SectorExtension {
  code: string
  name: string
  /** Version semver de l'extension elle-même (évolution indépendante). */
  version: string
  /** Version du contrat sectoriel implémenté — le registre refuse un mismatch. */
  contractVersion: string
  /** Entités métier spécifiques déclarées par l'extension (descriptif). */
  entities: string[]
  /** KPIs spécifiques déclarés par l'extension (descriptif). */
  kpis: string[]
  /**
   * Hook de paiement (optionnel) — fonction PURE : pas d'accès base, pas
   * d'import du Core, pas d'effet de bord. Une extension ne peut donc pas
   * contaminer le comportement du noyau : elle ne peut que renvoyer des constats.
   */
  evaluatePayment?: (ctx: SectorPaymentContext) => SectorFinding[]
}
