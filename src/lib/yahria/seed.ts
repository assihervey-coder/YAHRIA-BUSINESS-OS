// YAHRIA BUSINESS OS V1 — Bootstrap seed (idempotent)
// Seeds: tenant/org, SYSCOHADA chart, Core entities, Money, Finance (balanced entries),
// 15 agents (spec §5.6), policies, country packs CI/SN, 13 sector engines, graph projection.
import { db } from '@/lib/db'
import { rebuildGraphProjection } from './graph'
import { postEntry } from './ledger'
import { recordEvidence, audit } from './audit'

const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY)
const ahead = (days: number) => new Date(Date.now() + days * DAY)

const SYSCOHADA: [string, string, number, string][] = [
  ['241', 'Matériel industriel et commercial', 2, 'ASSET'],
  ['281', 'Amortissements des immobilisations corporelles', 2, 'ASSET'],
  ['401', 'Fournisseurs', 4, 'LIABILITY'],
  ['411', 'Clients', 4, 'ASSET'],
  ['422', 'Personnel - rémunérations dues', 4, 'LIABILITY'],
  ['4431', 'État - TVA collectée', 4, 'LIABILITY'],
  ['4452', 'État - TVA récupérable', 4, 'ASSET'],
  ['521', 'Banques (SGCI)', 5, 'TREASURY'],
  ['5212', 'Compte Wave', 5, 'TREASURY'],
  ['522', 'Mobile Money', 5, 'TREASURY'],
  ['571', 'Caisse', 5, 'TREASURY'],
  ['601', 'Achats de matières premières', 6, 'EXPENSE'],
  ['622', 'Locations et charges locatives', 6, 'EXPENSE'],
  ['628', 'Frais de télécommunications', 6, 'EXPENSE'],
  ['61', 'Transports', 6, 'EXPENSE'],
  ['64', 'Charges de personnel', 6, 'EXPENSE'],
  ['661', 'Charges financières', 6, 'EXPENSE'],
  ['701', 'Ventes de produits finis', 7, 'REVENUE'],
  ['706', 'Prestations de services', 7, 'REVENUE'],
  ['816', 'Impôts sur les bénéfices', 8, 'EXPENSE'],
]

const AGENTS = [
  ['FinanceAgent', 'Agent Financier', 'FINANCE', 'READONLY', 'SUGGEST', 'Analyse la santé financière, détecte les dérives budgétaires et propose des arbitrages de trésorerie.', ['ANALYSE_FINANCE', 'GENERATE_REPORT'], ['graph.query', 'finance.kpi.read'], 0, 0],
  ['TreasuryAgent', 'Agent Trésorerie', 'TREASURY', 'READONLY', 'SUGGEST', 'Surveille la position de trésorerie multi-comptes et alerte sur les tensions prévisionnelles.', ['MONITOR_TREASURY', 'FORECAST_CASH'], ['money.accounts.read', 'forecast.run'], 0, 0],
  ['AccountingAgent', 'Agent Comptable', 'ACCOUNTING', 'READONLY', 'RECOMMEND', 'Prépare les écritures proposées (lettrage, rapprochements) sans jamais les valider seul.', ['PREPARE_ENTRIES', 'RECONCILE_PROPOSE'], ['finance.journal.read', 'finance.reconcile.propose'], 0, 0],
  ['PaymentAgent', 'Agent Paiement', 'PAYMENT', 'ACTIVE', 'ACT', 'Exécute les paiements routiniers sous le seuil d\'autonomie ; toute action au-delà requiert une approbation humaine (INV-009).', ['CREATE_PAYMENT', 'EXECUTE_PAYMENT'], ['money.pay.create', 'money.pay.execute', 'orchestration.route'], 2000000, 250000],
  ['ProcurementAgent', 'Agent Achats', 'PROCUREMENT', 'READONLY', 'RECOMMEND', 'Compare les fournisseurs, détecte les ruptures et prépare les demandes de commande.', ['COMPARE_SUPPLIERS', 'DRAFT_PO'], ['core.suppliers.read', 'procurement.draft'], 0, 0],
  ['SupplierAgent', 'Agent Fournisseurs', 'PROCUREMENT', 'READONLY', 'SUGGEST', 'Évalue la performance et le risque des fournisseurs, propose des re-négociations.', ['SCORE_SUPPLIER'], ['core.suppliers.read', 'risk.score'], 0, 0],
  ['PayrollAgent', 'Agent Paie', 'TREASURY', 'READONLY', 'RECOMMEND', 'Prépare la masse salariale conforme au Country Pack (CNPS, ITS) ; exécution toujours humaine.', ['PREPARE_PAYROLL'], ['people.read', 'countrypack.rules.read'], 0, 0],
  ['SalesAgent', 'Agent Commercial', 'SALES', 'ACTIVE', 'RECOMMEND', 'Analyse le pipeline, propose des relances clients et détecte les opportunités.', ['RELANCE_CLIENT', 'ANALYSE_SALES'], ['core.customers.read', 'finance.invoices.read'], 500000, 150000],
  ['CustomerAgent', 'Agent Client', 'SALES', 'READONLY', 'SUGGEST', 'Répond aux questions clients à partir du Business Graph et de l\'historique.', ['ANSWER_CUSTOMER'], ['graph.query', 'core.customers.read'], 0, 0],
  ['ComplianceAgent', 'Agent Conformité', 'COMPLIANCE', 'READONLY', 'RECOMMEND', 'Vérifie la conformité OHADA/DGI : mentions factures, TVA, échéances déclaratives.', ['CHECK_COMPLIANCE'], ['countrypack.rules.read', 'finance.invoices.read'], 0, 0],
  ['RiskAgent', 'Agent Risque', 'RISK', 'READONLY', 'RECOMMEND', 'Scorre les contreparties, détecte les anomalies de paiement et les risques de fraude.', ['SCORE_RISK', 'DETECT_ANOMALY'], ['graph.query', 'risk.score'], 0, 0],
  ['TaxAgent', 'Agent Fiscal', 'TAX', 'READONLY', 'SUGGEST', 'Calcule la TVA nette due, prépare les télédéclarations DGI (pack CI/SN).', ['COMPUTE_TAX'], ['finance.tax.read', 'countrypack.rules.read'], 0, 0],
  ['OperationsAgent', 'Agent Opérations', 'OPS', 'READONLY', 'SUGGEST', 'Suit les opérations journalières, les tâches et les goulots d\'étranglement.', ['MONITOR_OPS'], ['core.tasks.read'], 0, 0],
  ['ReportingAgent', 'Agent Reporting', 'REPORTING', 'ACTIVE', 'ACT', 'Génère et diffuse les rapports périodiques (SIG OHADA, KPI direction) sans intervention humaine.', ['GENERATE_REPORT', 'SEND_REPORT'], ['finance.report.generate', 'notify.send'], 50000, 50000],
  ['ExecutiveAgent', 'Agent Direction', 'EXECUTIVE', 'READONLY', 'SUGGEST', 'Copilote de direction : synthétise situation financière, risques et recommandations.', ['EXECUTIVE_BRIEF'], ['graph.query', 'finance.kpi.read', 'ai.reason'], 0, 0],
] as const

const POLICIES: [string, string, string, string, Record<string, unknown>][] = [
  ['PAY-001', 'Exécution directe sous seuil', 'PAYMENT', 'Tout paiement < 250 000 FCFA avec risque < 60 est exécuté directement.', { autoApproveBelow: 250000, approvalRequiredBelow: 2000000, denyOver: 10000000, highRiskScoreThreshold: 60 }],
  ['PAY-002', 'Approbation humaine obligatoire', 'APPROVAL', 'Tout paiement ≥ 250 000 FCFA requiert une validation humaine (INV-009).', { threshold: 250000 }],
  ['PAY-003', 'Plafond de paiement V1', 'PAYMENT', 'Au-delà de 10 000 000 FCFA : blocage — double signature hors périmètre V1.', { denyOver: 10000000 }],
  ['PAY-004', 'Revue des transactions à risque', 'PAYMENT', 'Score de risque ≥ 60 : passage obligatoire en revue humaine.', { highRiskScoreThreshold: 60 }],
  ['AGENT-001', 'Moindre privilège agent', 'AGENT', 'Un agent ne dispose que des outils déclarés dans son registre (INV-010).', { defaultStatus: 'READONLY' }],
  ['AGENT-002', 'Idempotence des actions', 'AGENT', 'Toute action financière d\'agent porte une clé d\'idempotence (INV-006).', {}],
  ['AI-001', 'Preuve des réponses IA', 'AI', 'Toute réponse IA à impact métier produit une Evidence exploitable (INV-008).', { evidenceRequired: true }],
  ['AI-002', 'Explicabilité des décisions', 'AI', 'Les décisions IA critiques doivent être expliquables et tracer leurs sources (INV-015).', { ragTraceability: true }],
  ['SEC-001', 'Cloisonnement multi-tenant', 'SECURITY', 'Aucune donnée inter-tenant accessible (INV-001, INV-TENANT-002).', { rls: true }],
  ['DATA-001', 'Traçabilité des opérations', 'DATA', 'trace_id + correlation_id sur toute opération critique.', {}],
]

const SECTORS = [
  ['enterprise', 'Entreprise', 'Socle généraliste : devis, factures, achats, RH, reporting.'],
  ['ngo', 'ONG', 'Financements par projet, bailleurs, justification des dépenses.'],
  ['microfinance', 'Microfinance', 'Dossiers de crédit, échéanciers, portefeuille à risque.'],
  ['retail', 'Commerce de détail', 'Caisse, stock multi-boutiques, marges par SKU.'],
  ['education', 'Éducation', 'Scolarité, inscriptions, effectifs, personnels.'],
  ['construction', 'BTP', 'Chantiers, situations de travaux, attachements, métrés.'],
  ['industry', 'Industrie', 'OF, nomenclatures, coût de revient, capacité.'],
  ['toll', 'Péage', 'Passages, recettes par voie, réconciliation quotidienne.'],
  ['restaurant', 'Restauration', 'Carte, tables, MP, food cost, ventes par service.'],
  ['ecommerce', 'E-commerce', 'Catalogue, commandes, livraison, paiement en ligne.'],
  ['travel', 'Voyages', 'Billets, dossiers voyageurs, commissions IATA.'],
  ['healthcare', 'Santé', 'Patients, consultations, actes, caisse clinique.'],
  ['money_transfer', 'Transfert d\'argent', 'Transferts KYC, agences, réconciliation fournisseurs.'],
]

async function seedCountryPacks() {
  await db.countryPack.upsert({
    where: { code: 'CI' },
    update: {},
    create: {
      code: 'CI', name: 'Côte d\'Ivoire', currency: 'XOF', vatRate: 0.18,
      mobileMoneyJson: JSON.stringify([
        { provider: 'ORANGE_MONEY', label: 'Orange Money CI', feePct: 0.015, maxTx: 2000000, active: true },
        { provider: 'MTN_MOMO', label: 'MTN MoMo', feePct: 0.017, maxTx: 1500000, active: true },
        { provider: 'WAVE', label: 'Wave', feePct: 0.01, maxTx: 1000000, active: true },
        { provider: 'MOOV_MONEY', label: 'Moov Money', feePct: 0.016, maxTx: 1000000, active: false },
      ]),
      banksJson: JSON.stringify([
        { provider: 'SGCI', label: 'Société Générale CI', transferFee: 2500, active: true },
        { provider: 'BICICI', label: 'BICICI', transferFee: 3000, active: true },
      ]),
      payrollJson: JSON.stringify({ cnpsEmployer: 0.125, cnpsEmployee: 0.063, its: 'barème progressif', minWage: 75000 }),
      complianceJson: JSON.stringify({ dgi: 'DGI-CI télédéclaration', dsn: 'DSN CNPS mensuelle', ohada: 'SYSCOHADA révisé' }),
      invoicingJson: JSON.stringify({ vatLabel: 'TVA 18%', mentions: ['NCC', 'RCCM', 'Regime TVA'], currencyLabel: 'FCFA (XOF)' }),
    },
  })
  await db.countryPack.upsert({
    where: { code: 'SN' },
    update: {},
    create: {
      code: 'SN', name: 'Sénégal', currency: 'XOF', vatRate: 0.18,
      mobileMoneyJson: JSON.stringify([
        { provider: 'WAVE', label: 'Wave SN', feePct: 0.01, maxTx: 1000000, active: true },
        { provider: 'ORANGE_MONEY', label: 'Orange Money SN', feePct: 0.015, maxTx: 2000000, active: true },
        { provider: 'EXPRESSO', label: 'Expresso Sen', feePct: 0.016, maxTx: 800000, active: false },
      ]),
      banksJson: JSON.stringify([
        { provider: 'SGSN', label: 'Société Générale Sénégal', transferFee: 3000, active: true },
        { provider: 'BOA_SN', label: 'BOA Sénégal', transferFee: 3500, active: true },
      ]),
      payrollJson: JSON.stringify({ ipres: 0.14, cssEmployer: 0.07, its: 'barème progressif SN', minWage: 209289 }),
      complianceJson: JSON.stringify({ dgi: 'DGID télédéclaration SN', ohada: 'SYSCOHADA révisé' }),
      invoicingJson: JSON.stringify({ vatLabel: 'TVA 18%', mentions: ['NINEA', 'RC'], currencyLabel: 'FCFA (XOF)' }),
    },
  })
}

async function seedSectorEngines() {
  for (const [code, name, description] of SECTORS) {
    await db.sectorEngine.upsert({
      where: { code },
      update: {},
      create: {
        code, name, description,
        entitiesJson: JSON.stringify(['À spécifier V1.1']),
        kpisJson: JSON.stringify(['CA', 'Marge', 'Encours']),
        workflowsJson: JSON.stringify(['cycle de vente', 'approbation']),
        status: code === 'enterprise' ? 'AVAILABLE' : code === 'retail' ? 'AVAILABLE' : 'PLANNED',
      },
    })
  }
}

export async function ensureSeeded(): Promise<string> {
  const existing = await db.tenant.findFirst()
  if (existing) return existing.id

  const tenant = await db.tenant.create({ data: { slug: 'yahria-demo', name: 'YAHRIA Demo Tenant', plan: 'ENTERPRISE' } })
  const org = await db.organization.create({
    data: {
      tenantId: tenant.id,
      name: 'Ivoire Distribution',
      legalName: 'IVOIRE DISTRIBUTION SA',
      countryCode: 'CI',
      city: 'Abidjan',
      currencyCode: 'XOF',
      sectorCode: 'ENTERPRISE',
      taxId: '1945877 K',
      rccm: 'CI-ABJ-2019-B-12345',
    },
  })
  const orgId = org.id

  // SYSCOHADA chart
  await db.account.createMany({
    data: SYSCOHADA.map(([code, name, cls, type]) => ({ orgId, code, name, class: cls as number, type: type as string })),
  })

  // Customers
  const customersData: [string, string, string, string, number][] = [
    ['CLI-001', 'Sahel Agro SARL', 'SME', 'Bouaké', 35],
    ['CLI-002', 'Groupe Koffi & Fils', 'CORP', 'Abidjan', 15],
    ['CLI-003', 'Hôpital Sainte-Marie', 'GOV', 'Yamoussoukro', 10],
    ['CLI-004', 'Boutique Awa Traoré', 'RETAIL', 'Abidjan', 55],
    ['CLI-005', 'Cabinet Diarra Conseil', 'SME', 'Abidjan', 20],
    ['CLI-006', 'Coopérative Cacao Ouest', 'NGO', 'Daloa', 30],
    ['CLI-007', 'Ets Bamba Électronique', 'RETAIL', 'Abidjan', 45],
    ['CLI-008', 'Sanogo Logistics', 'CORP', 'San-Pédro', 25],
  ]
  const customers = [] as { id: string; name: string; riskScore: number }[]
  for (const [code, name, segment, city, risk] of customersData) {
    customers.push(
      await db.customer.create({
        data: { orgId, code, name, segment, city, countryCode: 'CI', email: `contact@${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10)}.ci`, riskScore: risk as number },
      })
    )
  }

  // Suppliers
  const suppliersData: [string, string, string][] = [
    ['FRN-001', 'SIFCA Logistique', 'LOGISTICS'],
    ['FRN-002', 'Petro Ivoire', 'UTILITIES'],
    ['FRN-003', 'Fournitures Bâtiment CI', 'SUPPLIES'],
    ['FRN-004', 'Orange CI Entreprises', 'TELECOM'],
    ['FRN-005', 'Imprimerie Nouvelle', 'SERVICES'],
    ['FRN-006', 'TransAgence Abidjan', 'LOGISTICS'],
  ]
  const suppliers = [] as { id: string; name: string }[]
  for (const [code, name, category] of suppliersData) {
    suppliers.push(await db.supplier.create({ data: { orgId, code, name, category, city: 'Abidjan', performance: 70 + Math.floor(Math.random() * 30) } }))
  }

  // Employees
  const employeesData: [string, string, string, string, string, number][] = [
    ['EMP-001', 'Awa Koné', 'Directeur Général', 'DIRECTION', 'CDI', 1200000],
    ['EMP-002', 'Ibrahim Coulibaly', 'Responsable Financier', 'FINANCE', 'CDI', 850000],
    ['EMP-003', 'Fatou Diomandé', 'Comptable', 'FINANCE', 'CDI', 550000],
    ['EMP-004', 'Yao Kouassi', 'Chef d\'entrepôt', 'OPS', 'CDI', 420000],
    ['EMP-005', 'Mariam Sylla', 'Commerciale', 'COMMERCIAL', 'CDI', 480000],
    ['EMP-006', 'Jean-Marc Behanzin', 'IT Manager', 'IT', 'CDD', 750000],
  ]
  const employees = [] as { id: string }[]
  for (const [code, name, position, department, contractType, grossSalary] of employeesData) {
    employees.push(await db.employee.create({ data: { orgId, code, name, position, department, contractType, grossSalary: grossSalary as number, hiredAt: ago(400 + Math.floor(Math.random() * 800)) } }))
  }

  // Products
  const productsData: [string, string, string, string, number, number | null][] = [
    ['PRD-001', 'Riz parfumé 25kg (sac)', 'PRODUCT', 'sac', 18500, 340],
    ['PRD-002', 'Huile végétale 5L (carton)', 'PRODUCT', 'carton', 27000, 120],
    ['PRD-003', 'Sucre granulé 50kg (sac)', 'PRODUCT', 'sac', 31000, 80],
    ['PRD-004', 'Pâtes alimentaires (colis)', 'PRODUCT', 'colis', 9800, 210],
    ['PRD-005', 'Savon de ménage (palette)', 'PRODUCT', 'palette', 64000, 25],
    ['SRV-001', 'Livraison Abidjan grand Sud', 'SERVICE', 'course', 35000, null],
    ['SRV-002', 'Distribution sous-traitée mensuelle', 'SERVICE', 'forfait', 450000, null],
    ['SRV-003', 'Prestation logistique B2B', 'SERVICE', 'heure', 15000, null],
  ]
  const products = [] as { id: string; name: string; type: string; unitPrice: number; vatRate: number }[]
  for (const [code, name, type, unit, unitPrice, stock] of productsData) {
    const prd = await db.product.create({ data: { orgId, code, name, type, unit, unitPrice: unitPrice as number, stock: (stock ?? undefined) as number | undefined } })
    products.push(prd)
  }

  // Payment accounts
  const accBank = await db.paymentAccount.create({ data: { orgId, name: 'SGCI — Compte courant principal', type: 'BANK', provider: 'SGCI', accountNo: 'CI93 SCI 0123 4567 8901 2345', balance: 48250000, isDefault: true } })
  const accWave = await db.paymentAccount.create({ data: { orgId, name: 'Wave Business', type: 'MOBILE_MONEY', provider: 'WAVE', accountNo: '+225 07 08 09 10 11', balance: 3450000 } })
  const accOM = await db.paymentAccount.create({ data: { orgId, name: 'Orange Money Pro', type: 'MOBILE_MONEY', provider: 'ORANGE_MONEY', accountNo: '+225 07 12 34 56 78', balance: 2180000 } })
  const accMTN = await db.paymentAccount.create({ data: { orgId, name: 'MTN MoMo Business', type: 'MOBILE_MONEY', provider: 'MTN_MOMO', accountNo: '+225 05 98 76 54 32', balance: 3250000 } })
  const accCash = await db.paymentAccount.create({ data: { orgId, name: 'Caisse siège Abidjan', type: 'CASH', provider: 'CAISSE', balance: 850000 } })

  // Invoices (12) — statuses: PAID x5, SENT x3, OVERDUE x3, DRAFT x1
  interface InvSpec { cust: number; days: number; dueIn: number; status: string; lines: [number, number][]; paid?: number }
  const invSpecs: InvSpec[] = [
    { cust: 1, days: 60, dueIn: -30, status: 'OVERDUE', lines: [[0, 40], [3, 30]] },           // ~1.63M
    { cust: 0, days: 75, dueIn: -45, status: 'OVERDUE', lines: [[1, 12], [4, 3]] },            // ~846k
    { cust: 3, days: 90, dueIn: -60, status: 'OVERDUE', lines: [[0, 15]] },                    // ~327k
    { cust: 2, days: 40, dueIn: -10, status: 'SENT', lines: [[7, 60]] },                       // ~1.06M
    { cust: 6, days: 20, dueIn: 10, status: 'SENT', lines: [[3, 50]] },                        // ~578k
    { cust: 4, days: 15, dueIn: 15, status: 'SENT', lines: [[5, 8], [6, 1]] },                 // ~730k
    { cust: 5, days: 55, dueIn: -25, status: 'PAID', lines: [[2, 10]] , paid: 1 },             // ~366k
    { cust: 7, days: 50, dueIn: -20, status: 'PAID', lines: [[1, 20]] , paid: 1 },             // ~638k
    { cust: 1, days: 45, dueIn: 5, status: 'PAID', lines: [[0, 25]] , paid: 1 },               // ~546k
    { cust: 2, days: 30, dueIn: 20, status: 'PAID', lines: [[7, 25]] , paid: 1 },              // ~443k
    { cust: 0, days: 10, dueIn: 20, status: 'PAID', lines: [[3, 80]] , paid: 1 },              // ~925k
    { cust: 6, days: 3, dueIn: 27, status: 'DRAFT', lines: [[4, 5], [5, 4]] },                 // ~600k
  ]
  let invNo = 1
  const createdInvoices: { id: string; total: number; status: string; number: string; customerId: string; paidAmount: number }[] = []
  for (const spec of invSpecs) {
    const linesData = spec.lines.map(([pi, qty]) => {
      const p = products[pi]
      const lineTotal = Math.round(p.unitPrice * qty * (1 + p.vatRate))
      return { description: p.name, quantity: qty, unitPrice: p.unitPrice, vatRate: p.vatRate, lineTotal }
    })
    const subtotal = Math.round(spec.lines.reduce((s, [pi, qty]) => s + products[pi].unitPrice * qty, 0))
    const vatAmount = Math.round(subtotal * 0.18)
    const total = subtotal + vatAmount
    const inv = await db.invoice.create({
      data: {
        orgId,
        number: `FAC-2026-${String(invNo++).padStart(3, '0')}`,
        customerId: customers[spec.cust].id,
        status: spec.status,
        issueDate: ago(spec.days),
        dueDate: spec.status === 'OVERDUE' ? ago(-spec.dueIn) : ahead(spec.dueIn),
        subtotal, vatAmount, total,
        paidAmount: spec.paid ? total : 0,
        notes: 'Facture conforme SYSCOHADA — TVA 18% (pack CI)',
        lines: { create: linesData },
      },
    })
    createdInvoices.push({ id: inv.id, total, status: inv.status, number: inv.number, customerId: inv.customerId, paidAmount: inv.paidAmount })

    // Journal: 411 debit TTC / 70x credit HT / 4431 credit TVA (for SENT/OVERDUE/PAID — not DRAFT)
    if (spec.status !== 'DRAFT') {
      const revAccount = spec.lines.some(([pi]) => products[pi].type === 'SERVICE') ? '706' : '701'
      await postEntry({
        orgId,
        entryDate: ago(spec.days),
        reference: `FAC/${inv.number}`,
        description: `Facture ${inv.number} — ${customers[spec.cust].name}`,
        source: 'INVOICE',
        sourceId: inv.id,
        lines: [
          { accountCode: '411', debit: total },
          { accountCode: revAccount, credit: subtotal },
          { accountCode: '4431', credit: vatAmount },
        ],
      })
    }
  }

  // Expenses
  const expensesData: [string, string, string, number, number, number | null][] = [
    ['DEP-001', 'RENT', 'Loyer entrepôt Yopougon — T3', 2500000, 450000, 2],
    ['DEP-002', 'FUEL', 'Carburant flotte livraison (2 mois)', 950000, 171000, 1],
    ['DEP-003', 'TELECOM', 'FAI + mobile entreprise', 385000, 69300, 3],
    ['DEP-004', 'SUPPLIES', 'Emballages et palettes', 620000, 111600, 2],
    ['DEP-005', 'TRANSPORT', 'Transport régional Bouaké/Korhogo', 740000, 133200, 5],
    ['DEP-006', 'SALARIES', 'Masse salariale — mois précédent', 4250000, 0, null],
    ['DEP-007', 'UTILITIES', 'Électricité entrepôt + siège', 310000, 55800, null],
    ['DEP-008', 'OTHER', 'Maintenance groupe électrogène', 180000, 32400, 4],
  ]
  const createdExpenses = [] as { id: string; reference: string; amount: number; category: string; supplierId: string | null; status: string }[]
  for (let i = 0; i < expensesData.length; i++) {
    const [reference, category, description, amount, vatAmount, supIdx] = expensesData[i]
    const exp = await db.expense.create({
      data: {
        orgId, reference, category, description, amount, vatAmount,
        supplierId: supIdx !== null ? suppliers[supIdx].id : null,
        status: i < 5 ? 'PAID' : i === 5 ? 'APPROVED' : 'PENDING',
        expenseDate: ago(5 + i * 9),
      },
    })
    createdExpenses.push({ id: exp.id, reference: exp.reference, amount: exp.amount, category: exp.category, supplierId: exp.supplierId, status: exp.status })
    // Journal for PAID expenses: 6xx debit HT + 4452 debit TVA / 521 credit TTC
    if (exp.status === 'PAID') {
      const expAccount = category === 'RENT' ? '622' : category === 'TELECOM' ? '628' : category === 'TRANSPORT' || category === 'FUEL' ? '61' : category === 'SALARIES' ? '64' : '601'
      await postEntry({
        orgId, entryDate: exp.expenseDate, reference: `DEP/${reference}`,
        description: `Dépense ${reference} — ${description}`, source: 'EXPENSE', sourceId: exp.id,
        lines: [
          { accountCode: expAccount, debit: amount },
          ...(vatAmount > 0 ? [{ accountCode: '4452', debit: vatAmount }] : []),
          { accountCode: '521', credit: amount + vatAmount },
        ],
      })
    }
  }

  // Payments — executed collections + disbursements, with reconciliations & evidence
  const executedCollections = createdInvoices.filter((i) => i.status === 'PAID')
  let payNo = 1
  for (const inv of executedCollections) {
    const acc = payNo % 3 === 0 ? accWave : payNo % 3 === 1 ? accBank : accOM
    const method = acc.type === 'BANK' ? 'BANK_TRANSFER' : 'MOBILE_MONEY'
    const cust = customers.find((c) => c.id === inv.customerId)!
    const payment = await db.payment.create({
      data: {
        orgId, reference: `ENC-2026-${String(payNo).padStart(3, '0')}`,
        idempotencyKey: `seed-collection-${payNo}`,
        type: 'COLLECTION', direction: 'IN', amount: inv.total, currency: 'XOF',
        counterpartyName: cust.name, counterpartyType: 'CUSTOMER',
        method, provider: acc.provider, destAccountId: acc.id, invoiceId: inv.id,
        status: payNo % 2 === 0 ? 'RECONCILED' : 'EXECUTED',
        policyDecisionId: `PDC-${payNo}-ENC`, policyDecision: 'ALLOW', policyReason: 'PAY-001 : encaissement standard',
        riskScore: 8 + (payNo % 3) * 4, riskLevel: 'LOW',
        initiatedByType: 'HUMAN', initiatedByName: 'Fatou Diomandé',
        reason: 'Encaissement facture ' + inv.number,
        timeline: JSON.stringify([
          { ts: ago(3).toISOString(), state: 'PENDING_POLICY', note: 'Contrôle politique PAY-001' },
          { ts: ago(3).toISOString(), state: 'APPROVED', note: 'Décision ALLOW automatique' },
          { ts: ago(3).toISOString(), state: 'EXECUTED', note: `Exécuté via ${acc.provider}` },
        ]),
        executedAt: ago(3),
        createdAt: ago(4),
      },
    })
    if (payment.status === 'RECONCILED') {
      await db.reconciliation.create({
        data: { orgId, paymentId: payment.id, externalRef: `${acc.provider}-${1000 + payNo}`, provider: acc.provider, amount: inv.total, matched: true, variance: 0, note: 'Rapprochement automatique flux provider' },
      })
    }
    const ev = await recordEvidence({
      orgId, kind: 'PAYMENT', title: `Encaissement ${payment.reference}`, relatedId: payment.id,
      payload: { payment: payment.reference, invoice: inv.number, amount: inv.total, provider: acc.provider, method },
    })
    await db.payment.update({ where: { id: payment.id }, data: { evidenceId: ev.ref } })
    // Money layer: credit account
    await db.paymentAccount.update({ where: { id: acc.id }, data: { balance: { increment: inv.total } } })
    // Finance layer: debit treasury / credit 411
    const treasuryAcc = acc.type === 'BANK' ? '521' : acc.type === 'CASH' ? '571' : acc.provider === 'WAVE' ? '5212' : '522'
    await postEntry({
      orgId, entryDate: ago(3), reference: `ENC/${payment.reference}`,
      description: `Encaissement ${inv.number} — ${cust.name}`, source: 'PAYMENT', sourceId: payment.id,
      lines: [
        { accountCode: treasuryAcc, debit: inv.total },
        { accountCode: '411', credit: inv.total },
      ],
    })
    payNo++
  }

  // Disbursements (paid expenses via bank / mobile money)
  const paidExpenses = createdExpenses.filter((e) => e.status === 'PAID')
  for (let i = 0; i < paidExpenses.length; i++) {
    const exp = paidExpenses[i]
    const acc = i % 2 === 0 ? accBank : accMTN
    const method = acc.type === 'BANK' ? 'BANK_TRANSFER' : 'MOBILE_MONEY'
    const supplier = suppliers.find((s) => s.id === exp.supplierId)
    const amount = exp.amount + Math.round(exp.amount * 0.18)
    const payment = await db.payment.create({
      data: {
        orgId, reference: `DEC-2026-${String(i + 1).padStart(3, '0')}`,
        idempotencyKey: `seed-disb-${i + 1}`,
        type: 'DISBURSEMENT', direction: 'OUT', amount, currency: 'XOF',
        counterpartyName: supplier?.name ?? 'État / Divers', counterpartyType: 'SUPPLIER',
        method, provider: acc.provider, sourceAccountId: acc.id, expenseId: exp.id,
        status: i === 0 ? 'RECONCILED' : 'EXECUTED',
        policyDecisionId: `PDC-${i + 1}-DEC`, policyDecision: i === 0 ? 'REQUIRE_APPROVAL' : 'ALLOW',
        policyReason: i === 0 ? 'PAY-002 : montant ≥ 250 000 FCFA — approuvé par Awa Koné (DG)' : 'PAY-001',
        riskScore: i === 0 ? 42 : 15, riskLevel: i === 0 ? 'MEDIUM' : 'LOW',
        initiatedByType: 'HUMAN', initiatedByName: 'Ibrahim Coulibaly',
        reason: `Règlement dépense ${exp.reference}`,
        timeline: JSON.stringify([
          { ts: ago(6).toISOString(), state: 'PENDING_POLICY', note: 'Contrôle politique' },
          ...(i === 0 ? [{ ts: ago(6).toISOString(), state: 'PENDING_APPROVAL', note: 'Approbation humaine requise (PAY-002)' }, { ts: ago(5).toISOString(), state: 'APPROVED', note: 'Approuvé par Awa Koné (DG)' }] : []),
          { ts: ago(5).toISOString(), state: 'EXECUTED', note: `Décaissé via ${acc.provider}` },
        ]),
        executedAt: ago(5), createdAt: ago(6),
      },
    })
    if (payment.status === 'RECONCILED') {
      await db.reconciliation.create({
        data: { orgId, paymentId: payment.id, externalRef: `${acc.provider}-${2000 + i}`, provider: acc.provider, amount, matched: true, variance: 0, note: 'Relevé bancaire rapproché' },
      })
    }
    await db.paymentAccount.update({ where: { id: acc.id }, data: { balance: { decrement: amount } } })
  }

  // Payroll payment
  const payrollNet = employees.reduce((s, e) => 0, 0)
  void payrollNet
  const gross = employeesData.reduce((s, e) => s + (e[5] as number), 0)
  const payrollPay = await db.payment.create({
    data: {
      orgId, reference: 'DEC-2026-006', idempotencyKey: 'seed-payroll-1',
      type: 'DISBURSEMENT', direction: 'OUT', amount: gross, currency: 'XOF',
      counterpartyName: 'Masse salariale (6 employés)', counterpartyType: 'EMPLOYEE',
      method: 'BANK_TRANSFER', provider: 'SGCI', sourceAccountId: accBank.id,
      status: 'EXECUTED', policyDecisionId: 'PDC-PAY-1', policyDecision: 'REQUIRE_APPROVAL',
      policyReason: 'PAY-002 : masse salariale — approuvée par Awa Koné (DG)', riskScore: 20, riskLevel: 'LOW',
      initiatedByType: 'HUMAN', initiatedByName: 'Ibrahim Coulibaly',
      reason: 'Paie mensuelle — virement SGCI',
      timeline: JSON.stringify([
        { ts: ago(8).toISOString(), state: 'PENDING_APPROVAL', note: 'Paie préparée par PayrollAgent (préparation seule)' },
        { ts: ago(7).toISOString(), state: 'APPROVED', note: 'Approuvée par Awa Koné (DG)' },
        { ts: ago(7).toISOString(), state: 'EXECUTED', note: 'Virement exécuté' },
      ]),
      executedAt: ago(7), createdAt: ago(8),
    },
  })
  await db.paymentAccount.update({ where: { id: accBank.id }, data: { balance: { decrement: gross } } })
  await postEntry({
    orgId, entryDate: ago(8), reference: `PAIE/${ago(8).toISOString().slice(0, 10)}`,
    description: 'Masse salariale mensuelle', source: 'PAYROLL',
    lines: [{ accountCode: '64', debit: gross }, { accountCode: '521', credit: gross }],
  })

  // Agents (15 — spec §5.6)
  for (const [code, name, domain, status, autonomyLevel, description, capabilities, tools, maxAmount, approvalAbove] of AGENTS) {
    await db.agent.create({
      data: {
        orgId, code, name, domain, status, autonomyLevel, description,
        capabilities: JSON.stringify(capabilities), tools: JSON.stringify(tools),
        maxAmount: maxAmount as number, approvalAbove: approvalAbove as number,
        readOnly: status === 'READONLY',
      },
    })
  }

  // Policies
  for (const [code, name, category, description, rule] of POLICIES) {
    await db.policy.upsert({
      where: { code },
      update: {},
      create: { orgId, code, name, category, description, ruleJson: JSON.stringify(rule) },
    })
  }

  // Country packs + sector engines
  await seedCountryPacks()
  await seedSectorEngines()

  // Completed agent runs (history)
  const paymentAgent = await db.agent.findUnique({ where: { code: 'PaymentAgent' } })
  const reportingAgent = await db.agent.findUnique({ where: { code: 'ReportingAgent' } })
  const riskAgent = await db.agent.findUnique({ where: { code: 'RiskAgent' } })
  const treasuryAgent = await db.agent.findUnique({ where: { code: 'TreasuryAgent' } })

  if (reportingAgent) {
    const ev1 = await recordEvidence({
      orgId, kind: 'AGENT_DECISION', title: 'Rapport hebdo généré par ReportingAgent', relatedId: reportingAgent.id,
      payload: { report: 'KPI hebdo', channels: ['email DG'], period: 'S-1' },
    })
    await db.agentRun.create({
      data: {
        orgId, agentId: reportingAgent.id, intent: 'GENERATE_REPORT hebdomadaire direction',
        state: 'COMPLETED', riskScore: 5, riskLevel: 'LOW',
        steps: JSON.stringify([
          { step: 'Intent', state: 'INFO', detail: 'Rapport KPI hebdomadaire (programmation cron)' },
          { step: 'Plan', state: 'OK', detail: 'Lecture KPI → composition rapport → diffusion email' },
          { step: 'Policy', state: 'OK', detail: 'ALLOW — ReportingAgent en ACTIVE, rapport sans impact financier' },
          { step: 'Authorization', state: 'OK', detail: 'Outil finance.report.generate autorisé' },
          { step: 'Risk', state: 'OK', detail: 'Score 5/100 — LOW' },
          { step: 'Approval', state: 'INFO', detail: 'Non requise (sous seuil, action non financière)' },
          { step: 'Execution', state: 'OK', detail: 'Rapport généré et envoyé à la direction' },
          { step: 'Evidence', state: 'OK', detail: `Preuve ${ev1.ref} enregistrée` },
          { step: 'Audit', state: 'OK', detail: 'Écrit dans le journal d\'audit immuable' },
        ]),
        resultJson: JSON.stringify({ report: 'KPI_S-1.pdf', sent: true }),
        evidenceId: ev1.ref, completedAt: ago(2), createdAt: ago(2),
      },
    })
    await audit({ orgId, actorType: 'AGENT', actorId: reportingAgent.id, actorName: 'ReportingAgent', action: 'REPORT_GENERATED', resourceType: 'REPORT', summary: 'Rapport KPI hebdomadaire généré et diffusé', meta: { evidence: ev1.ref } })
  }

  if (riskAgent) {
    await db.agentRun.create({
      data: {
        orgId, agentId: riskAgent.id, intent: 'SCORE_RISK portefeuille clients',
        state: 'COMPLETED', riskScore: 10, riskLevel: 'LOW',
        steps: JSON.stringify([
          { step: 'Intent', state: 'INFO', detail: 'Re-scorer le risque des 8 clients actifs' },
          { step: 'Policy', state: 'OK', detail: 'ALLOW — lecture seule' },
          { step: 'Authorization', state: 'OK', detail: 'Outil graph.query + risk.score autorisés' },
          { step: 'Execution', state: 'OK', detail: '2 clients remontés : Boutique Awa Traoré (55), Ets Bamba (45) — retards de paiement' },
          { step: 'Evidence', state: 'OK', detail: 'Scoring enregistré dans le graphe' },
          { step: 'Audit', state: 'OK', detail: 'Journalisé' },
        ]),
        resultJson: JSON.stringify({ flagged: ['Boutique Awa Traoré', 'Ets Bamba Électronique'] }),
        completedAt: ago(1), createdAt: ago(1),
      },
    })
  }

  if (treasuryAgent) {
    await db.agentRun.create({
      data: {
        orgId, agentId: treasuryAgent.id, intent: 'FORECAST_CASH 30 jours',
        state: 'COMPLETED', riskScore: 5, riskLevel: 'LOW',
        steps: JSON.stringify([
          { step: 'Intent', state: 'INFO', detail: 'Prévision de trésorerie à 30 jours' },
          { step: 'Policy', state: 'OK', detail: 'ALLOW — lecture seule' },
          { step: 'Execution', state: 'WARN', detail: 'Tension détectée à J+18 si les 3 factures en retard ne sont pas recouvrées' },
          { step: 'Evidence', state: 'OK', detail: 'Projection J+30 enregistrée' },
          { step: 'Audit', state: 'OK', detail: 'Journalisé' },
        ]),
        resultJson: JSON.stringify({ horizonDays: 30, tension: 'J+18', worstCase: 12400000 }),
        completedAt: ago(1), createdAt: ago(1),
      },
    })
  }

  // AWAITING APPROVAL: PaymentAgent wants to pay supplier (3 680 000 F) — INV-009
  if (paymentAgent) {
    const run = await db.agentRun.create({
      data: {
        orgId, agentId: paymentAgent.id, intent: 'EXECUTE_PAYMENT fournisseur SIFCA Logistique — facture SIF-2026-088 (1 850 000 FCFA)',
        state: 'AWAITING_APPROVAL', riskScore: 55, riskLevel: 'MEDIUM',
        policyDecisionId: 'PDC-AG-001', policyDecision: 'REQUIRE_APPROVAL',
        steps: JSON.stringify([
          { step: 'Intent', state: 'INFO', detail: 'Payer la facture fournisseur SIF-2026-088 (1 850 000 FCFA)' },
          { step: 'Plan', state: 'OK', detail: 'Routage : solde SGCI suffisant → virement bancaire' },
          { step: 'Policy', state: 'WAIT', detail: 'REQUIRE_APPROVAL — INV-009 : action d\'agent > 250 000 FCFA' },
          { step: 'Authorization', state: 'OK', detail: 'Outil money.pay.execute autorisé pour PaymentAgent' },
          { step: 'Risk', state: 'WARN', detail: 'Score 55/100 — MEDIUM (montant élevé + fournisseur logistique critique)' },
          { step: 'Approval', state: 'WAIT', detail: 'En attente de validation humaine — Awa Koné (DG)' },
        ]),
        proposedAction: JSON.stringify({ action: 'CREATE_DISBURSEMENT', amount: 1850000, currency: 'XOF', counterparty: 'SIFCA Logistique', sourceAccountId: accBank.id, method: 'BANK_TRANSFER', reason: 'Facture SIF-2026-088 — transport inter-régional' }),
        createdAt: ago(0),
      },
    })
    await db.approval.create({
      data: {
        orgId, kind: 'AGENT_ACTION', runId: run.id,
        title: 'PaymentAgent — Décaissement 1 850 000 FCFA vers SIFCA Logistique',
        description: 'L\'agent PaymentAgent propose de régler la facture fournisseur SIF-2026-088 par virement SGCI. Décision policy : REQUIRE_APPROVAL (INV-009 — au-delà du seuil d\'autonomie de 250 000 FCFA). Risque : MEDIUM (48/100).',
        amount: 1850000, currency: 'XOF', requestedBy: 'PaymentAgent', riskLevel: 'MEDIUM',
      },
    })
  }

  // Pending human payment approval (large disbursement)
  const bigPay = await db.payment.create({
    data: {
      orgId, reference: 'DEC-2026-007', idempotencyKey: 'seed-bigpay-1',
      type: 'DISBURSEMENT', direction: 'OUT', amount: 5240000, currency: 'XOF',
      counterpartyName: 'Fournitures Bâtiment CI', counterpartyType: 'SUPPLIER',
      method: 'BANK_TRANSFER', provider: 'SGCI', sourceAccountId: accBank.id,
      status: 'PENDING_APPROVAL', policyDecisionId: 'PDC-DEC-007', policyDecision: 'REQUIRE_APPROVAL',
      policyReason: 'PAY-002 : montant ≥ 250 000 FCFA — validation humaine requise', riskScore: 48, riskLevel: 'MEDIUM',
      initiatedByType: 'HUMAN', initiatedByName: 'Ibrahim Coulibaly',
      reason: 'Commande emballages trimestrielle (bon de commande BC-2026-041)',
      timeline: JSON.stringify([
        { ts: new Date().toISOString(), state: 'PENDING_POLICY', note: 'Contrôle politique PAY-002' },
        { ts: new Date().toISOString(), state: 'PENDING_APPROVAL', note: 'En attente de validation — Awa Koné (DG)' },
      ]),
      createdAt: new Date(),
    },
  })
  await db.approval.create({
    data: {
      orgId, kind: 'PAYMENT', paymentId: bigPay.id,
      title: 'Décaissement 5 240 000 FCFA — Fournitures Bâtiment CI',
      description: 'Paiement fournisseur initiaé par le Responsable Financier. Policy PAY-002 exige la validation du DG avant exécution.',
      amount: 5240000, currency: 'XOF', requestedBy: 'Ibrahim Coulibaly', riskLevel: 'MEDIUM',
    },
  })

  // Initial evidence for AI answer
  await recordEvidence({
    orgId, kind: 'AI_ANSWER', title: 'Brief direction — Copilot Executive',
    payload: { question: 'Quelle est la situation financière ?', summary: 'Trésorerie stable, recouvrement en retard sur 3 factures (2,8M FCFA).', models: ['glm-4.6'], sources: ['graph.query', 'finance.kpi.read'] },
  })

  // Graph projection
  await rebuildGraphProjection(orgId)

  // Initial audit records
  await audit({ orgId, actorType: 'SYSTEM', action: 'SYSTEM_BOOTSTRAP', resourceType: 'TENANT', summary: 'Initialisation du tenant YAHRIA Demo + organisation Ivoire Distribution SA', meta: { seed: 'v1' } })
  await audit({ orgId, actorType: 'SYSTEM', action: 'GRAPH_REBUILT', resourceType: 'BUSINESS_GRAPH', summary: 'Projection Business Graph reconstruite (INV-GRAPH-004)' })

  return tenant.id
}

export async function getPrimaryOrgId(): Promise<string> {
  await ensureSeeded()
  const org = await db.organization.findFirst()
  if (!org) throw new Error('No organization found')
  return org.id
}
