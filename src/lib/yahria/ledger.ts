// YAHRIA BUSINESS OS V1 — 02_FINANCE : double-entry ledger engine (INV-ACC-001)
import { db } from '@/lib/db'

export interface PostingLine {
  accountCode: string
  debit?: number
  credit?: number
}

const ACCOUNT_NAMES: Record<string, string> = {
  '571': 'Caisse',
  '521': 'Banques (SGCI)',
  '5212': 'Compte Wave',
  '522': 'Mobile Money',
  '411': 'Clients',
  '401': 'Fournisseurs',
  '422': 'Personnel - rémunérations dues',
  '4431': 'État - TVA collectée',
  '4452': 'État - TVA récupérable',
  '701': 'Ventes de produits finis',
  '706': 'Prestations de services',
  '601': 'Achats de matières',
  '604': 'Achats stockés de matières',
  '61': 'Transports',
  '622': 'Locations et charges locatives',
  '628': 'Frais de télécommunications',
  '633': 'Rémunérations d\'intermédiaires',
  '64': 'Charges de personnel',
  '661': 'Charges financières',
  '641': 'Transports sur ventes',
}

export function accountName(code: string): string {
  return ACCOUNT_NAMES[code] ?? `Compte ${code}`
}

/**
 * Posts a balanced journal entry. INV-ACC-001: SUM(DEBIT) === SUM(CREDIT)
 * Throws when unbalanced — the invariant is enforced at the service layer.
 */
export async function postEntry(opts: {
  orgId: string
  entryDate?: Date
  reference: string
  description: string
  source: string
  sourceId?: string
  lines: PostingLine[]
}) {
  const lines = opts.lines.map((l) => ({
    accountCode: l.accountCode,
    accountName: accountName(l.accountCode),
    debit: Math.round(l.debit ?? 0),
    credit: Math.round(l.credit ?? 0),
  }))
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  if (totalDebit !== totalCredit || totalDebit === 0) {
    throw new Error(
      `INV-ACC-001 violated: débit=${totalDebit} crédit=${totalCredit} — écriture refusée (${opts.reference})`
    )
  }
  const entry = await db.journalEntry.create({
    data: {
      orgId: opts.orgId,
      entryDate: opts.entryDate ?? new Date(),
      reference: opts.reference,
      description: opts.description,
      source: opts.source,
      sourceId: opts.sourceId,
      posted: true,
      lines: { create: lines },
    },
    include: { lines: true },
  })
  return entry
}

/**
 * Mirror movement on payment accounts (MONEY layer) so treasury stays consistent.
 */
export async function applyAccountDelta(accountId: string, delta: number) {
  const acc = await db.paymentAccount.findUnique({ where: { id: accountId } })
  if (!acc) return
  await db.paymentAccount.update({
    where: { id: accountId },
    data: { balance: { increment: delta } },
  })
}
