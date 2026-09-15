// YAHRIA BUSINESS OS V1 — Contrat sectoriel public VERSIONNÉ (INV-012 / INV-013)
// Ce fichier définit LE contrat auquel toute extension sectorielle doit se
// conformer. Il n'importe AUCUN module du Core : la dépendance va toujours du
// registre vers le contrat, jamais du Core vers une extension concrète.
//
// VERSIONNAGE (semver, INV-013) :
//   · MAJOR  → rupture : nouveaux hooks obligatoires ou sémantique modifiée
//   · MINOR  → ajout compatible : NOUVEAU HOOK OPTIONNEL (une extension v1
//              continue de fonctionner — le registre négocie par extension)
//   · PATCH  → clarification sans changement de surface
// Le registre n'accepte qu'une extension dont contractVersion ∈ SUPPORTED ;
// les versions v1 et v2 coexistent PAR CONSTRUCTION (migration progressive,
// jamais big-bang).

export const SECTOR_CONTRACT_VERSION = '2.0.0'
export const SUPPORTED_CONTRACT_VERSIONS = ['1.0.0', '2.0.0'] as const
export type SupportedContractVersion = (typeof SUPPORTED_CONTRACT_VERSIONS)[number]

/** Une version publiée du contrat sectoriel — immuable une fois publiée. */
export interface SectorContractRelease {
  version: string
  publishedAt: string
  status: 'CURRENT' | 'SUPPORTED'
  /** Hooks disponibles dans cette version. */
  hooks: readonly string[]
  changes: readonly string[]
  migration: string
}

export const SECTOR_CONTRACT_VERSIONS: Record<SupportedContractVersion, SectorContractRelease> = {
  '1.0.0': {
    version: '1.0.0',
    publishedAt: '2026-09-01',
    status: 'SUPPORTED',
    hooks: ['evaluatePayment'],
    changes: [
      'Hook evaluatePayment — constats consultatifs sur les paiements (fonction pure)',
      'Champs descriptifs entities / kpis déclarés par l\u2019extension',
      'Isolation structurelle : registre → contrat → extensions, jamais le Core',
    ],
    migration: 'Aucune migration requise — les extensions v1 restent servies par le registre sous le contrat courant.',
  },
  '2.0.0': {
    version: '2.0.0',
    publishedAt: '2026-09-15',
    status: 'CURRENT',
    hooks: ['evaluatePayment', 'evaluateInvoice', 'evaluatePayroll'],
    changes: [
      'NOUVEAU hook evaluateInvoice — constats de facturation sectoriels (contexte montant, TVA, segment client)',
      'NOUVEAU hook evaluatePayroll — constats de paie sectoriels (contexte effectif, masse salariale, période)',
      'Négociation de version : le registre refuse toute extension dont contractVersion n\u2019est pas supportée',
      'Coexistence v1 + v2 par construction : migration progressive extension par extension',
    ],
    migration: 'v1 → v2 : compatible ascendante — chaque extension implémente les nouveaux hooks OPTIONNELS à son rythme ; contractVersion passe à 2.0.0 quand le premier hook v2 est adopté.',
  },
}

/** Contexte d'évaluation paiement (v1 — inchangé). */
export interface SectorPaymentContext {
  sectorCode: string
  countryCode: string
  amount: number
  currency: string
  provider: string | null
  direction: 'IN' | 'OUT' | 'INTERNAL'
  counterpartyType: string | null
}

/** Contexte d'évaluation facturation (v2). */
export interface SectorInvoiceContext {
  sectorCode: string
  countryCode: string
  amount: number // TTC
  vatRate: number
  currency: string
  customerSegment: string | null
}

/** Contexte d'évaluation paie (v2). */
export interface SectorPayrollContext {
  sectorCode: string
  countryCode: string
  period: string // YYYY-MM
  headcount: number
  grossTotal: number
  currency: string
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
  /** Hook paiement (v1) — fonction PURE : pas d'accès base, pas d'import du Core. */
  evaluatePayment?: (ctx: SectorPaymentContext) => SectorFinding[]
  /** Hook facturation (v2, optionnel) — même contrat de pureté. */
  evaluateInvoice?: (ctx: SectorInvoiceContext) => SectorFinding[]
  /** Hook paie (v2, optionnel) — même contrat de pureté. */
  evaluatePayroll?: (ctx: SectorPayrollContext) => SectorFinding[]
}

/** Le contrat accepte-t-il cette version d'extension ? (négociation INV-013) */
export function isContractVersionAccepted(v: string): boolean {
  return (SUPPORTED_CONTRACT_VERSIONS as readonly string[]).includes(v?.trim?.() ?? '')
}

/** Métadonnées de la version courante du contrat. */
export function currentContractRelease(): SectorContractRelease {
  return SECTOR_CONTRACT_VERSIONS[SECTOR_CONTRACT_VERSION as SupportedContractVersion]
}
