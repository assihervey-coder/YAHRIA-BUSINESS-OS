// YAHRIA — CONTRAT SECTORIEL VERSIONNÉ : harnais de preuve (unitaire)
// Usage : bun scripts/test_sector_contract_versioning.ts   (sans serveur)
import fs from 'node:fs'
import path from 'node:path'
import {
  SECTOR_CONTRACT_VERSION, SUPPORTED_CONTRACT_VERSIONS, SECTOR_CONTRACT_VERSIONS,
  isContractVersionAccepted,
} from '../src/lib/yahria/sectors/contract'
import {
  registryIntegrity, negotiateContract, getSector, listSectors,
  evaluateSectorPayment, evaluateSectorInvoice, evaluateSectorPayroll,
} from '../src/lib/yahria/sectors/registry'
import { contractsOverview, isSemver } from '../src/lib/yahria/contracts'

let pass = 0
let fail = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`) }
  else { fail++; failures.push(label); console.log(`  ✗ ${label} — ${detail}`) }
}

async function main() {
  console.log('\n── 1. VERSIONS PUBLIÉES DU CONTRAT (semver + changelog) ──')
  const versions = Object.keys(SECTOR_CONTRACT_VERSIONS)
  check('1.1 au moins 2 releases publiées (v1 + v2)', versions.length >= 2, versions.map((v) => `v${v}`).join(', '))
  check('1.2 toutes les versions sont des semver valides', versions.every((v) => isSemver(v)))
  check('1.3 la version courante est bien déclarée CURRENT', SECTOR_CONTRACT_VERSIONS[SECTOR_CONTRACT_VERSION as keyof typeof SECTOR_CONTRACT_VERSIONS]?.status === 'CURRENT', `courante = v${SECTOR_CONTRACT_VERSION}`)
  check('1.4 chaque release documente ses hooks et sa migration', versions.every((v) => SECTOR_CONTRACT_VERSIONS[v as keyof typeof SECTOR_CONTRACT_VERSIONS].hooks.length > 0 && SECTOR_CONTRACT_VERSIONS[v as keyof typeof SECTOR_CONTRACT_VERSIONS].migration.length > 10))
  check('1.5 v2 ⊃ v1 (compatible ascendante)', (() => {
    const v1 = new Set(SECTOR_CONTRACT_VERSIONS['1.0.0'].hooks)
    return [...v1].every((h) => SECTOR_CONTRACT_VERSIONS['2.0.0'].hooks.includes(h))
  })())
  check('1.6 dates de publication monotones (v1 < v2)', SECTOR_CONTRACT_VERSIONS['1.0.0'].publishedAt < SECTOR_CONTRACT_VERSIONS['2.0.0'].publishedAt)

  console.log('\n── 2. NÉGOCIATION DE VERSION (refus explicite) ──')
  check('2.1 négocier(1.0.0) acceptée', negotiateContract('1.0.0').accepted === true)
  check('2.2 négocier(2.0.0) acceptée + release servie', negotiateContract('2.0.0').accepted === true && negotiateContract('2.0.0').release !== null)
  check('2.3 négocier(9.9.9) REFUSÉE explicitement', negotiateContract('9.9.9').accepted === false)
  check('2.4 isContractVersionAccepted cohérent avec SUPPORTED', SUPPORTED_CONTRACT_VERSIONS.every((v) => isContractVersionAccepted(v)) && !isContractVersionAccepted('0.9.0'))

  console.log('── 3. REGISTRE : coexistence v1 + v2 ──')
  const reg = registryIntegrity()
  check('3.1 13 extensions enregistrées', reg.total === 13, `${reg.total}`)
  check('3.2 aucune extension refusée (versions toutes supportées)', reg.refused.length === 0, reg.refused.map((r) => r.code).join(', '))
  check('3.3 extensions v1 présentes (coexistence)', (reg.byContractVersion['1.0.0'] ?? 0) >= 10, `${reg.byContractVersion['1.0.0'] ?? 0} × v1`)
  check('3.4 extensions v2 présentes (migration progressive)', reg.byContractVersion['2.0.0'] === 3, `${reg.byContractVersion['2.0.0']} × v2`)
  check('3.5 hooks v2 couverts : evaluateInvoice + evaluatePayroll', (reg.hooksCoverage.evaluateInvoice ?? 0) >= 1 && (reg.hooksCoverage.evaluatePayroll ?? 0) >= 1, `invoice×${reg.hooksCoverage.evaluateInvoice ?? 0} payroll×${reg.hooksCoverage.evaluatePayroll ?? 0}`)
  check('3.6 versionsOk (aucune version invalide enregistrée)', reg.versionsOk)

  console.log('── 4. COEXISTENCE PAR EXTENSION ──')
  const retail = getSector('retail')
  const construction = getSector('construction')
  const education = getSector('education')
  check('4.1 retail (v1) : evaluatePayment SEUL', retail?.contractVersion === '1.0.0' && typeof retail?.evaluatePayment === 'function' && typeof retail?.evaluateInvoice !== 'function')
  check('4.2 construction (v2) : les 3 hooks', construction?.contractVersion === '2.0.0' && typeof construction?.evaluatePayment === 'function' && typeof construction?.evaluateInvoice === 'function' && typeof construction?.evaluatePayroll === 'function')
  check('4.3 education (v2) : paiement + paie (facture optionnelle non implémentée — ok)', education?.contractVersion === '2.0.0' && typeof education?.evaluatePayroll === 'function')
  check('4.4 listSectors() ne sert QUE les versions acceptées', listSectors().length === reg.total)
  check('4.5 getSector inexistant → null', getSector('secteur-fantome') === null)

  console.log('── 5. DISPATCHERS v2 (confinement + pureté) ──')
  const f1 = evaluateSectorInvoice('construction', { countryCode: 'BJ', amount: 3_000_000, vatRate: 0.18, currency: 'XOF', customerSegment: 'CORP' })
  check('5.1 facture chantier majeure → 1 constat WARN', f1.length === 1 && f1[0].code === 'BTP_FACT_SITUATION' && f1[0].severity === 'WARN', JSON.stringify(f1))
  const f2 = evaluateSectorInvoice('construction', { countryCode: 'BJ', amount: 100_000, vatRate: 0.18, currency: 'XOF', customerSegment: 'SME' })
  check('5.2 petite facture → aucun constat', f2.length === 0)
  const f3 = evaluateSectorInvoice('retail', { countryCode: 'CI', amount: 3_000_000, vatRate: 0.18, currency: 'XOF', customerSegment: null })
  check('5.3 extension v1 sans hook facture → aucun constat (coexistence)', f3.length === 0)
  const p1 = evaluateSectorPayroll('education', { countryCode: 'SN', period: '2026-07', headcount: 8, grossTotal: 4_000_000, currency: 'XOF' })
  check('5.4 paie éducation → constat masse salariale', p1.length === 1 && p1[0].code === 'EDU_MASSE_SALARIALE')
  const p2 = evaluateSectorPayroll('microfinance', { countryCode: 'CI', period: '2026-07', headcount: 12, grossTotal: 6_000_000, currency: 'XOF' })
  check('5.5 paie microfinance ≥ 10 agents → constat ventilation', p2.length === 1 && p2[0].code === 'MFI_PAIE_AGENTS')
  const p3 = evaluateSectorPayroll('retail', { countryCode: 'BJ', period: '2026-07', headcount: 20, grossTotal: 9_000_000, currency: 'XOF' })
  check('5.6 paie retail (v1) → aucun constat', p3.length === 0)
  const f1b = evaluateSectorInvoice('construction', { countryCode: 'BJ', amount: 3_000_000, vatRate: 0.18, currency: 'XOF', customerSegment: 'CORP' })
  check('5.7 PURETÉ : même entrée → même sortie (déterministe)', JSON.stringify(f1) === JSON.stringify(f1b))
  const pErr = evaluateSectorPayroll('SECTEUR_INCONNU', { countryCode: 'BJ', period: '2026-07', headcount: 1, grossTotal: 1, currency: 'XOF' })
  check('5.8 secteur inconnu → aucun constat, jamais de lever', Array.isArray(pErr) && pErr.length === 0)
  const pay1 = evaluateSectorPayment('microfinance', { countryCode: 'BJ', amount: 100_000, currency: 'XOF', provider: null, direction: 'OUT', counterpartyType: 'CUSTOMER' })
  check('5.9 hook v1 evaluatePayment toujours servi', pay1.length === 1 && pay1[0].code === 'MFI_DECAISSEMENT')

  console.log('── 6. CONTRATS PUBLICS (INV-013) ──')
  const overview = contractsOverview()
  check('6.1 5 contrats publics', overview.length === 5, overview.map((c) => c.contractId).join(' · '))
  check('6.2 tous en semver valide', overview.every((c) => c.semver))
  check('6.3 contrat sectoriel annoncé en v2.0.0', overview.find((c) => c.contractId === 'YBOS-SECTOR')?.version === '2.0.0')

  console.log('── 7. FRONTIÈRE STRUCTURELLE (re-scan INV-012) ──')
  const libDir = path.join(process.cwd(), 'src', 'lib', 'yahria')
  const coreFiles = fs.readdirSync(libDir).filter((f) => f.endsWith('.ts'))
  const contaminated = coreFiles.filter((f) => /from\s+['"][^'"]*sectors\/extensions['"]/.test(fs.readFileSync(path.join(libDir, f), 'utf8')))
  check('7.1 le Core n\u2019importe jamais une extension concrète', contaminated.length === 0, contaminated.join(', ') || `${coreFiles.length} modules scannés`)
  const sectorFiles = fs.readdirSync(path.join(libDir, 'sectors')).filter((f) => f.endsWith('.ts'))
  const upward = sectorFiles.filter((f) => {
    const src = fs.readFileSync(path.join(libDir, 'sectors', f), 'utf8')
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    return imports.some((i) => !i.startsWith('node:') && !i.startsWith('./contract') && !i.startsWith('./extensions') && !i.startsWith('./registry'))
  })
  check('7.2 les extensions n\u2019importent jamais le Core', upward.length === 0, upward.join(', ') || `${sectorFiles.length} fichiers scannés`)

  console.log(`\n═══ CONTRAT SECTORIEL VERSIONNÉ : ${pass} PASS / ${fail} FAIL ═══`)
  if (failures.length) { console.log('ÉCHECS :', failures.join(' | ')); process.exit(1) }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
