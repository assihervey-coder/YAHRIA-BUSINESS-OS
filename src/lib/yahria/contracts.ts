// YAHRIA BUSINESS OS V1 — Contrats publics versionnés (INV-013 Versioning)
// Tout contrat exposé au-delà de son module (API HTTP, manifest Country Pack,
// contrat sectoriel, ledger de preuves) porte un numéro semver déclaré ICI.
// Règles :
//   · MAJOR  → rupture de compatibilité (les consommateurs doivent migrer)
//   · MINOR  → ajout compatible (nouveau champ, nouvelle route)
//   · PATCH  → correction sans changement de contrat
// Les routes API annoncent leur version via les en-têtes X-API-Version et
// X-Contract-Id (posés par withAuth sur TOUTES les réponses, y compris 401/403).

export const API_CONTRACT = {
  contractId: 'YBOS-API',
  name: 'YAHRIA Business OS — API publique',
  version: '1.1.0',
  schema: 'YBOS-ARCH-V1',
  publishedAt: '2026-09-14',
  changelog: [
    { version: '1.1.0', date: '2026-09-14', note: 'Multi-tenant : RBAC réel, RLS applicatif, Evidence signée en chaîne, pack Bénin (INV-011), invariants par construction' },
    { version: '1.0.0', date: '2026-09-01', note: 'Contrat initial V1 : 4 domaines (Core, Money, Finance OHADA, Graph), agents lecture seule, packs CI/SN' },
  ],
} as const

/** Contrat du ledger de preuves signées (algorithme + chaînage). */
export const EVIDENCE_LEDGER_SPEC = {
  contractId: 'YBOS-EVD',
  version: '2.0.0',
  algo: 'SHA-256 + HMAC-SHA256 (chaînée par organisation)',
} as const

/** Schéma de manifest des Country Packs (CI / SN / BJ). */
export const PACK_MANIFEST_SPEC = {
  contractId: 'YBOS-PACK',
  version: '1.0.0',
  fields: ['code', 'name', 'currency', 'vatRate', 'mobileMoney', 'banks', 'payroll', 'compliance', 'invoicing', 'version'],
} as const

/** Contrat public du registre sectoriel (INV-012). */
export const SECTOR_CONTRACT = {
  contractId: 'YBOS-SECTOR',
  version: '1.0.0',
  isolation: 'Les extensions sectorielles sont chargées exclusivement via le registre (sectors/registry) ; le Core n\u2019importe jamais une extension concrète.',
} as const

const SEMVER_RE = /^\d+\.\d+\.\d+$/

export function isSemver(v: string | null | undefined): boolean {
  return !!v && SEMVER_RE.test(v.trim())
}

/** Renvoie la liste des contrats publics avec leur statut de versionnement. */
export function contractsOverview() {
  return [
    { contractId: API_CONTRACT.contractId, name: API_CONTRACT.name, version: API_CONTRACT.version, semver: isSemver(API_CONTRACT.version), scope: 'Routes HTTP /api/v1' },
    { contractId: EVIDENCE_LEDGER_SPEC.contractId, name: 'Ledger de preuves signées', version: EVIDENCE_LEDGER_SPEC.version, semver: isSemver(EVIDENCE_LEDGER_SPEC.version), scope: 'Evidence (INV-008)' },
    { contractId: PACK_MANIFEST_SPEC.contractId, name: 'Manifest Country Pack', version: PACK_MANIFEST_SPEC.version, semver: isSemver(PACK_MANIFEST_SPEC.version), scope: 'Packs nationaux (INV-011)' },
    { contractId: SECTOR_CONTRACT.contractId, name: 'Registre sectoriel', version: SECTOR_CONTRACT.version, semver: isSemver(SECTOR_CONTRACT.version), scope: 'Extensions sectorielles (INV-012)' },
  ]
}
