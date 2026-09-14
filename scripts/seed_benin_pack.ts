// YAHRIA — Country Pack Bénin 🇧🇯 : seed idempotent
//  1) Packs nationaux : mention fiscale canonique (IFU / NCC / NINEA) + version 1.1.0
//  2) Org BJ (Golfe Trading & Services) : jeu de données comptable complet 2026 —
//     factures TVA 18 %, achats, règlements via rails BJ (INV-011), écritures
//     équilibrées (INV-ACC-001), lettrage facture↔règlement.
// Usage : npx tsx scripts/seed_benin_pack.ts
import { dbUnscoped as db } from '../src/lib/db'

const MARKER = 'BJ_PACK_SEED_V1'

function monthsAgo(n: number, day = 10): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, day, 9, 0, 0))
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400_000)
}

async function main() {
  // ── 1) Packs nationaux : mention fiscale canonique + version ──────────────
  const packs = await db.countryPack.findMany()
  for (const pk of packs) {
    const fiscalId = pk.code === 'BJ' ? 'IFU' : pk.code === 'CI' ? 'NCC' : 'NINEA'
    let inv: Record<string, unknown> = {}
    try { inv = JSON.parse(pk.invoicingJson ?? '{}') } catch { /* repli */ }
    inv.fiscalId = fiscalId
    await db.countryPack.update({
      where: { id: pk.id },
      data: { invoicingJson: JSON.stringify(inv), version: '1.1.0' },
    })
    console.log(`pack ${pk.code} → fiscalId=${fiscalId} v1.1.0`)
  }

  const bj = await db.organization.findFirst({ where: { countryCode: 'BJ' } })
  if (!bj) throw new Error('Organisation BJ introuvable')
  const marked = await db.auditRecord.findFirst({ where: { orgId: bj.id, action: MARKER } })
  if (marked) {
    console.log('Données BJ déjà semées (marqueur présent) — terminé.')
    return
  }

  // ── 2) Référentiel BJ : clients, produits, fournisseurs ───────────────────
  const customerSpecs = [
    { code: 'CLI-BJ-004', name: 'Sopat Bénin SARL', segment: 'SME', city: 'Porto-Novo' },
    { code: 'CLI-BJ-005', name: 'Sonapra Services', segment: 'CORP', city: 'Cotonou' },
    { code: 'CLI-BJ-006', name: 'Groupe Cebalès', segment: 'CORP', city: 'Parakou' },
    { code: 'CLI-BJ-007', name: 'Établissements Zinsou', segment: 'SME', city: 'Cotonou' },
    { code: 'CLI-BJ-008', name: 'Coop Agricole Dassa', segment: 'NGO', city: 'Dassa-Zoumè' },
    { code: 'CLI-BJ-009', name: 'Bénin Logistique SA', segment: 'CORP', city: 'Cotonou' },
  ]
  const customers: Record<string, string> = {}
  for (const c of customerSpecs) {
    const existing = await db.customer.findFirst({ where: { orgId: bj.id, code: c.code } })
    customers[c.code] = existing
      ? existing.id
      : (await db.customer.create({ data: { orgId: bj.id, ...c, countryCode: 'BJ' } })).id
  }
  const supplierSpecs = [
    { code: 'FRS-BJ-002', name: 'Moulins du Bénin', category: 'SUPPLIES', city: 'Cotonou' },
    { code: 'FRS-BJ-003', name: 'Transports Wémex', category: 'LOGISTICS', city: 'Porto-Novo' },
  ]
  const suppliers: Record<string, string> = {}
  for (const s of supplierSpecs) {
    const existing = await db.supplier.findFirst({ where: { orgId: bj.id, code: s.code } })
    suppliers[s.code] = existing
      ? existing.id
      : (await db.supplier.create({ data: { orgId: bj.id, ...s } })).id
  }
  const productSpecs = [
    { code: 'ART-BJ-101', name: 'Huile raffinée bidon 20L', type: 'PRODUCT', unitPrice: 24_000, stock: 340 },
    { code: 'ART-BJ-102', name: 'Riz parfumé sac 50kg', type: 'PRODUCT', unitPrice: 32_500, stock: 480 },
    { code: 'ART-BJ-103', name: 'Service logistique portuaire', type: 'SERVICE', unitPrice: 150_000, stock: null },
  ]
  const products: Record<string, string> = {}
  for (const pr of productSpecs) {
    const existing = await db.product.findFirst({ where: { orgId: bj.id, code: pr.code } })
    products[pr.code] = existing
      ? existing.id
      : (await db.product.create({
          data: { orgId: bj.id, ...pr, unit: pr.type === 'SERVICE' ? 'prestation' : 'unité' },
        })).id
  }

  // ── 3) Factures VTE (TVA 18 %) + écritures équilibrées ───────────────────
  const VAT = 0.18
  const acc = (code: string, name: string) => ({ accountCode: code, accountName: name })
  const ACCOUNTS = {
    cli: acc('411', 'Clients'),
    frs: acc('401', 'Fournisseurs'),
    tvaCol: acc('4431', 'État - TVA collectée'),
    tvaRep: acc('4452', 'État - TVA récupérable'),
    bank: acc('521', 'Banques (SGCI)'),
    momo: acc('522', 'Mobile Money'),
    achats: acc('601', 'Achats de matières premières'),
    ventes: acc('701', 'Ventes de produits finis'),
    services: acc('706', 'Prestations de services'),
    transport: acc('61', 'Transports'),
    telecom: acc('628', 'Frais de télécommunications'),
    loyers: acc('622', 'Locations et charges locatives'),
  }

  const momoRails = ['MTN_BJ', 'MOOV_BJ']
  const bankRails = ['BOA_BJ', 'SBCE', 'NSIA_BJ']

  interface InvSpec { number: string; cust: string; months: number; qty: number; product: string; status: string; payInDays?: number; rail?: string }
  const invSpecs: InvSpec[] = [
    { number: 'FAC-2026-BJ004', cust: 'CLI-BJ-004', months: 8, qty: 30, product: 'ART-BJ-101', status: 'PAID', payInDays: 9, rail: 'MTN_BJ' },
    { number: 'FAC-2026-BJ005', cust: 'CLI-BJ-005', months: 7, qty: 22, product: 'ART-BJ-102', status: 'PAID', payInDays: 12, rail: 'MOOV_BJ' },
    { number: 'FAC-2026-BJ006', cust: 'CLI-BJ-006', months: 7, qty: 6, product: 'ART-BJ-103', status: 'PAID', payInDays: 20, rail: 'BOA_BJ' },
    { number: 'FAC-2026-BJ007', cust: 'CLI-BJ-007', months: 6, qty: 18, product: 'ART-BJ-102', status: 'OVERDUE' },
    { number: 'FAC-2026-BJ008', cust: 'CLI-BJ-008', months: 5, qty: 12, product: 'ART-BJ-101', status: 'PAID', payInDays: 7, rail: 'MTN_BJ' },
    { number: 'FAC-2026-BJ009', cust: 'CLI-BJ-009', months: 4, qty: 9, product: 'ART-BJ-103', status: 'PAID', payInDays: 15, rail: 'SBCE' },
    { number: 'FAC-2026-BJ010', cust: 'CLI-BJ-004', months: 3, qty: 26, product: 'ART-BJ-102', status: 'SENT' },
    { number: 'FAC-2026-BJ011', cust: 'CLI-BJ-005', months: 2, qty: 40, product: 'ART-BJ-101', status: 'SENT' },
  ]

  let seqEnc = 3
  let seqDec = 3
  for (const spec of invSpecs) {
    const existingInv = await db.invoice.findUnique({ where: { number: spec.number } })
    if (existingInv) continue // idempotence par entité (reprise après échec partiel)
    const unitPrice = productSpecs.find((p) => p.code === spec.product)!.unitPrice
    const isService = spec.product === 'ART-BJ-103'
    const subtotal = unitPrice * spec.qty
    const vatAmount = Math.round(subtotal * VAT)
    const total = subtotal + vatAmount
    const issue = monthsAgo(spec.months, 8)
    const inv = await db.invoice.create({
      data: {
        orgId: bj.id, number: spec.number, customerId: customers[spec.cust], status: spec.status,
        issueDate: issue, dueDate: addDays(issue, 30), subtotal, vatRate: VAT, vatAmount, total,
        paidAmount: spec.status === 'PAID' ? total : 0,
        lines: { create: [{ productId: products[spec.product], description: isService ? 'Prestation logistique' : 'Livraison marchandises', quantity: spec.qty, unitPrice, vatRate: VAT, lineTotal: subtotal }] },
      },
    })
    const ventAccount = isService ? ACCOUNTS.services : ACCOUNTS.ventes
    await db.journalEntry.create({
      data: {
        orgId: bj.id, entryDate: issue, reference: `FAC/${spec.number}`,
        description: `Facture ${spec.number} — ${customerSpecs.find((c) => c.code === spec.cust)!.name}`,
        source: 'INVOICE', sourceId: inv.id, posted: true,
        lines: { create: [
          { ...ACCOUNTS.cli, debit: total, credit: 0 },
          { ...ventAccount, debit: 0, credit: subtotal },
          { ...ACCOUNTS.tvaCol, debit: 0, credit: vatAmount },
        ] },
      },
    })
    if (spec.status === 'PAID' && spec.rail) {
      seqEnc++
      const isMomo = momoRails.includes(spec.rail)
      const paid = addDays(issue, spec.payInDays ?? 10)
      const pay = await db.payment.create({
        data: {
          orgId: bj.id, reference: `ENC-2026-BJ${String(seqEnc).padStart(2, '0')}`, idempotencyKey: `bj-seed-enc-${seqEnc}`,
          type: 'COLLECTION', direction: 'IN', amount: total, fee: Math.round(total * (isMomo ? 0.017 : 0)),
          counterpartyName: customerSpecs.find((c) => c.code === spec.cust)!.name, counterpartyType: 'CUSTOMER',
          method: isMomo ? 'MOBILE_MONEY' : 'BANK_TRANSFER', provider: spec.rail, invoiceId: inv.id,
          status: 'EXECUTED', policyDecision: 'ALLOW', policyReason: `Rail ${spec.rail} ∈ pack Bénin (INV-011 OK)`,
          timeline: JSON.stringify([{ ts: paid.toISOString(), state: 'EXECUTED', note: `Encaissement ${spec.rail}` }]),
          executedAt: paid,
        },
      })
      await db.journalEntry.create({
        data: {
          orgId: bj.id, entryDate: paid, reference: `ENC/${pay.reference}`,
          description: `Encaissement ${spec.number} via ${spec.rail}`,
          source: 'PAYMENT', sourceId: pay.id, posted: true,
          lines: { create: [
            { ...(isMomo ? ACCOUNTS.momo : ACCOUNTS.bank), debit: total, credit: 0 },
            { ...ACCOUNTS.cli, debit: 0, credit: total },
          ] },
        },
      })
    }
  }

  // ── 4) Charges ACH + règlements fournisseurs ────────────────────────────
  const expSpecs = [
    { reference: 'DEP-BJ-003', category: 'SUPPLIES', description: 'Approvisionnement matières premières', amount: 1_250_000, vat: true, supplier: 'FRS-BJ-002', months: 6, status: 'PAID', rail: 'NSIA_BJ' },
    { reference: 'DEP-BJ-004', category: 'TRANSPORT', description: 'Fret Cotonou — Parakou', amount: 480_000, vat: true, supplier: 'FRS-BJ-003', months: 5, status: 'PAID', rail: 'MOOV_BJ' },
    { reference: 'DEP-BJ-005', category: 'RENT', description: 'Loyer entrepôt Cotonou T3', amount: 900_000, vat: false, supplier: null, months: 4, status: 'PAID', rail: 'SBCE' },
    { reference: 'DEP-BJ-006', category: 'TELECOM', description: 'Liens data agences', amount: 165_000, vat: true, supplier: null, months: 2, status: 'PENDING' },
    { reference: 'DEP-BJ-007', category: 'TRANSPORT', description: 'Distribution urbaine septembre', amount: 310_000, vat: true, supplier: 'FRS-BJ-003', months: 1, status: 'PENDING' },
  ]
  for (const spec of expSpecs) {
    const existingExp = await db.expense.findUnique({ where: { reference: spec.reference } })
    if (existingExp) continue // idempotence par entité
    const vatAmount = spec.vat ? Math.round(spec.amount * VAT) : 0
    const total = spec.amount + vatAmount
    const when = monthsAgo(spec.months, 14)
    const exp = await db.expense.create({
      data: {
        orgId: bj.id, reference: spec.reference, category: spec.category, description: spec.description,
        amount: spec.amount, vatAmount, supplierId: spec.supplier ? suppliers[spec.supplier] : null,
        status: spec.status, expenseDate: when,
      },
    })
    const chargeAccount = spec.category === 'TRANSPORT' ? ACCOUNTS.transport : spec.category === 'RENT' ? ACCOUNTS.loyers : spec.category === 'TELECOM' ? ACCOUNTS.telecom : ACCOUNTS.achats
    await db.journalEntry.create({
      data: {
        orgId: bj.id, entryDate: when, reference: `ACH/${spec.reference}`,
        description: `${spec.description} (${spec.reference})`,
        source: 'EXPENSE', sourceId: exp.id, posted: true,
        lines: { create: [
          { ...chargeAccount, debit: spec.amount, credit: 0 },
          ...(vatAmount ? [{ ...ACCOUNTS.tvaRep, debit: vatAmount, credit: 0 }] : []),
          { ...ACCOUNTS.frs, debit: 0, credit: total },
        ] },
      },
    })
    if (spec.status === 'PAID' && spec.rail) {
      seqDec++
      const isMomo = momoRails.includes(spec.rail)
      const paid = addDays(when, 6)
      const pay = await db.payment.create({
        data: {
          orgId: bj.id, reference: `DEC-2026-BJ${String(seqDec).padStart(2, '0')}`, idempotencyKey: `bj-seed-dec-${seqDec}`,
          type: 'DISBURSEMENT', direction: 'OUT', amount: total, fee: 0,
          counterpartyName: spec.supplier ? supplierSpecs.find((s) => s.code === spec.supplier)!.name : 'Bailleur Cotonou', counterpartyType: 'SUPPLIER',
          method: isMomo ? 'MOBILE_MONEY' : 'BANK_TRANSFER', provider: spec.rail, expenseId: exp.id,
          status: 'EXECUTED', policyDecision: 'ALLOW', policyReason: `Rail ${spec.rail} ∈ pack Bénin (INV-011 OK)`,
          timeline: JSON.stringify([{ ts: paid.toISOString(), state: 'EXECUTED', note: `Règlement ${spec.rail}` }]),
          executedAt: paid,
        },
      })
      await db.journalEntry.create({
        data: {
          orgId: bj.id, entryDate: paid, reference: `TRE/${pay.reference}`,
          description: `Règlement ${spec.reference} via ${spec.rail}`,
          source: 'PAYMENT', sourceId: pay.id, posted: true,
          lines: { create: [
            { ...ACCOUNTS.frs, debit: total, credit: 0 },
            { ...(isMomo ? ACCOUNTS.momo : ACCOUNTS.bank), debit: 0, credit: total },
          ] },
        },
      })
    }
  }

  // ── 5) Équilibre de contrôle (INV-ACC-001) ───────────────────────────────
  const jes = await db.journalEntry.findMany({ where: { orgId: bj.id, posted: true }, include: { lines: true } })
  let d = 0
  let c = 0
  for (const je of jes) for (const l of je.lines) { d += l.debit; c += l.credit }
  if (d !== c) throw new Error(`BJ déséquilibrée : D=${d} C=${c}`)
  console.log(`BJ équilibrée : ${jes.length} écritures, ΣD=ΣC=${d} XOF`)

  // ── 6) Marqueur d'idempotence ────────────────────────────────────────────
  await db.auditRecord.create({
    data: {
      orgId: bj.id, traceId: `bj-seed-${Date.now()}`, actorType: 'SYSTEM', actorId: 'seed',
      actorName: 'Seed Country Pack Bénin', action: MARKER, resourceType: 'ORGANIZATION', resourceId: bj.id,
      summary: 'Country Pack Bénin : mention fiscale IFU + données comptables 2026 semées',
      metaJson: JSON.stringify({ packVersion: '1.1.0', entries: jes.length, totalXof: d }),
    },
  })
  console.log('Country Pack Bénin seedé ✓')
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('FATAL', e); process.exit(1) })
