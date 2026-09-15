// YAHRIA BUSINESS OS V1 — 04_FINANCE : Export SYSCOHADA (SEC-004 / OHADA)
// Mise en forme OHADA du grand livre équilibré (INV-ACC-001) :
//  · Balance générale — par compte, classes 1..8, soldes débiteurs/créditeurs
//  · Grand livre — chronologique par compte, solde progressif + LETTRAGE
//    (rapprochement facture ↔ règlement via Payment.invoiceId / Payment.expenseId)
//  · Journaux — VTE / ACH / TRE / PAIE / OD (code journal OHADA)
// Les montants XOF n'ont pas de décimales (ISO 4217 : exponent 0).
import { db } from '@/lib/db'

// ── Journaux SYSCOHADA ──────────────────────────────────────────────────────
export const SYSCOHADA_JOURNALS: Record<string, { code: string; label: string }> = {
  INVOICE: { code: 'VTE', label: 'Journal des ventes' },
  EXPENSE: { code: 'ACH', label: 'Journal des achats et charges' },
  PAYMENT: { code: 'TRE', label: 'Journal de trésorerie' },
  PAYROLL: { code: 'PAIE', label: 'Journal de paie' },
  PAYROLL_REVERSAL: { code: 'PAIE', label: 'Journal de paie — contre-passation' },
  MANUAL: { code: 'OD', label: 'Opérations diverses' },
}

export function journalOf(source: string): { code: string; label: string } {
  return SYSCOHADA_JOURNALS[source] ?? { code: 'OD', label: 'Opérations diverses' }
}

const CLASS_NAMES: Record<number, string> = {
  1: 'Comptes de ressources durables',
  2: 'Comptes d\u2019actif immobilisé',
  3: 'Comptes de stocks',
  4: 'Comptes de tiers',
  5: 'Comptes de trésorerie',
  6: 'Comptes de charges',
  7: 'Comptes de produits',
  8: 'Comptes spéciaux',
}

export function classOf(accountCode: string): number {
  return Math.max(1, Math.min(8, parseInt(accountCode[0] ?? '8', 10) || 8))
}

export function classLabel(code: number): string {
  return CLASS_NAMES[code] ?? 'Comptes divers'
}

export function fmtXOF(n: number): string {
  // Intl fr-FR utilise U+202F (espace fine) comme séparateur — non encodable
  // en WinAnsi (polices PDF standard) : on le remplace par l'espace simple.
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(Math.round(n))
    .replace(/[\u202f\u00a0]/g, ' ')
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).split('-').reverse().join('/')
}

// ── Lecture des écritures ───────────────────────────────────────────────────
export interface EntryWithLines {
  id: string
  entryDate: Date
  reference: string
  description: string
  source: string
  sourceId: string | null
  lines: { accountCode: string; accountName: string; debit: number; credit: number }[]
}

export async function loadEntries(orgId: string, from: Date, to: Date): Promise<EntryWithLines[]> {
  const entries = await db.journalEntry.findMany({
    where: { orgId, posted: true, entryDate: { gte: from, lte: to } },
    orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    include: { lines: true },
  })
  return entries as EntryWithLines[]
}

export interface BalanceRow {
  code: string
  name: string
  klass: number
  totalDebit: number
  totalCredit: number
  soldeDebiteur: number
  soldeCrediteur: number
}

/** Balance générale : totaux par compte sur la période. */
export function computeBalance(entries: EntryWithLines[]): BalanceRow[] {
  const acc = new Map<string, BalanceRow>()
  for (const e of entries) {
    for (const l of e.lines) {
      let row = acc.get(l.accountCode)
      if (!row) {
        row = {
          code: l.accountCode,
          name: l.accountName,
          klass: classOf(l.accountCode),
          totalDebit: 0,
          totalCredit: 0,
          soldeDebiteur: 0,
          soldeCrediteur: 0,
        }
        acc.set(l.accountCode, row)
      }
      row.totalDebit += l.debit
      row.totalCredit += l.credit
    }
  }
  for (const row of acc.values()) {
    const delta = row.totalDebit - row.totalCredit
    row.soldeDebiteur = delta > 0 ? delta : 0
    row.soldeCrediteur = delta < 0 ? -delta : 0
  }
  return [...acc.values()].sort((a, b) => a.code.localeCompare(b.code))
}

// ── Lettrage : rapprochement facture ↔ règlement ────────────────────────────
/**
 * Construit une map entryId → lettre de lettrage :
 *  · compte 411 : écriture INVOICE (débit) ↔ écriture PAYMENT (crédit) liée par
 *    Payment.invoiceId (règlement client de la facture)
 *  · compte 401 : écriture EXPENSE (crédit) ↔ écriture PAYMENT (débit) liée par
 *    Payment.expenseId (règlement fournisseur de la charge)
 * Les lettres sont affectées par ordre chronologique de règlement (A, B, C…).
 */
export async function computeLettrage(orgId: string): Promise<Map<string, string>> {
  const letters = new Map<string, string>()
  const payments = await db.payment.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, invoiceId: true, expenseId: true },
  })
  const relevantSources = new Set(['INVOICE', 'PAYMENT', 'EXPENSE'])
  const entries = await db.journalEntry.findMany({
    where: { orgId, source: { in: [...relevantSources] } },
    orderBy: { entryDate: 'asc' },
    select: { id: true, source: true, sourceId: true },
  })
  const bySource = new Map<string, string>() // `${source}:${sourceId}` → entryId
  for (const e of entries) {
    if (e.sourceId) bySource.set(`${e.source}:${e.sourceId}`, e.id)
  }
  let letter = 0
  const nextLetter = () => (letter < 26 ? String.fromCharCode(65 + letter++) : 'Z+')

  for (const p of payments) {
    if (p.invoiceId) {
      const invEntry = bySource.get(`INVOICE:${p.invoiceId}`)
      const payEntry = bySource.get(`PAYMENT:${p.id}`)
      if (invEntry && payEntry) {
        const L = nextLetter()
        letters.set(invEntry, L)
        letters.set(payEntry, L)
      }
    }
    if (p.expenseId) {
      const expEntry = bySource.get(`EXPENSE:${p.expenseId}`)
      const payEntry = bySource.get(`PAYMENT:${p.id}`)
      if (expEntry && payEntry) {
        const L = nextLetter()
        letters.set(expEntry, L)
        letters.set(payEntry, L)
      }
    }
  }
  return letters
}

// ── Grand livre ─────────────────────────────────────────────────────────────
export interface GrandLivreRow {
  date: Date | null // null = à nouveau
  journal: string
  reference: string
  label: string
  debit: number
  credit: number
  solde: number // cumulatif
  lettre: string
}

export interface GrandLivreAccount {
  code: string
  name: string
  klass: number
  rows: GrandLivreRow[]
  totalDebit: number
  totalCredit: number
  soldeFinal: number // > 0 débiteur, < 0 créditeur
}

/** Grand livre par compte : ligne « à nouveau » (antériorité) + période, solde progressif. */
export function computeGrandLivre(
  prior: EntryWithLines[],
  period: EntryWithLines[],
  lettrage: Map<string, string>
): GrandLivreAccount[] {
  // Antériorité (à nouveau) par compte
  const opening = new Map<string, number>()
  for (const e of prior) {
    for (const l of e.lines) {
      opening.set(l.accountCode, (opening.get(l.accountCode) ?? 0) + l.debit - l.credit)
    }
  }
  // Comptes mouvementés sur la période
  const codes = new Set<string>()
  for (const e of period) for (const l of e.lines) codes.add(l.accountCode)

  const out: GrandLivreAccount[] = []
  for (const code of [...codes].sort((a, b) => a.localeCompare(b))) {
    const rows: GrandLivreRow[] = []
    let solde = opening.get(code) ?? 0
    if (opening.get(code)) {
      rows.push({
        date: null,
        journal: '—',
        reference: '—',
        label: 'Report à nouveau (exercice en cours)',
        debit: 0,
        credit: 0,
        solde,
        lettre: '',
      })
    }
    let totalDebit = 0
    let totalCredit = 0
    for (const e of period) {
      for (const l of e.lines) {
        if (l.accountCode !== code) continue
        solde += l.debit - l.credit
        totalDebit += l.debit
        totalCredit += l.credit
        rows.push({
          date: e.entryDate,
          journal: journalOf(e.source).code,
          reference: e.reference,
          label: l.accountName === '' ? e.description : `${e.description}`,
          debit: l.debit,
          credit: l.credit,
          solde,
          lettre: lettrage.get(e.id) ?? '',
        })
      }
    }
    out.push({
      code,
      name: period.find((e) => e.lines.some((l) => l.accountCode === code))?.lines.find((l) => l.accountCode === code)?.accountName ?? `Compte ${code}`,
      klass: classOf(code),
      rows,
      totalDebit,
      totalCredit,
      soldeFinal: solde,
    })
  }
  return out
}

// ── Journaux ────────────────────────────────────────────────────────────────
export interface JournalEntryRow {
  date: Date
  journalCode: string
  journalLabel: string
  reference: string
  description: string
  lines: { accountCode: string; accountName: string; debit: number; credit: number }[]
  totalDebit: number
  totalCredit: number
}

/** Journaux groupés par code (VTE, ACH, TRE, PAIE, OD). */
export function computeJournaux(entries: EntryWithLines[]): Map<string, { label: string; entries: JournalEntryRow[]; totalDebit: number; totalCredit: number }> {
  const byJournal = new Map<string, { label: string; entries: JournalEntryRow[]; totalDebit: number; totalCredit: number }>()
  for (const e of entries) {
    const { code, label } = journalOf(e.source)
    if (!byJournal.has(code)) byJournal.set(code, { label, entries: [], totalDebit: 0, totalCredit: 0 })
    const bucket = byJournal.get(code)!
    const totalDebit = e.lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = e.lines.reduce((s, l) => s + l.credit, 0)
    bucket.entries.push({
      date: e.entryDate,
      journalCode: code,
      journalLabel: label,
      reference: e.reference,
      description: e.description,
      lines: e.lines,
      totalDebit,
      totalCredit,
    })
    bucket.totalDebit += totalDebit
    bucket.totalCredit += totalCredit
  }
  return new Map([...byJournal.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

export interface ExportMeta {
  orgName: string
  legalName: string
  taxId: string
  taxIdLabel: string // IFU (Bénin) | NCC (Côte d'Ivoire) | NINEA (Sénégal) — dérivé du Country Pack national
  rccm: string
  countryCode: string
  currencyCode: string
  periodLabel: string
}

/** Libellé de l'identifiant fiscal national — PAR CONSTRUCTION depuis le pack (INV-011/013), avec repli déterministe. */
const TAX_ID_FALLBACK: Record<string, string> = { CI: 'NCC', SN: 'NINEA', BJ: 'IFU' }
function taxIdLabelOf(countryCode: string, invoicingJson: string | null): string {
  try {
    const inv = JSON.parse(invoicingJson ?? '{}') as { fiscalId?: string; mentions?: string[] }
    const canonical = ['IFU', 'NCC', 'NINEA']
    const fromFiscal = inv.fiscalId && canonical.includes(inv.fiscalId) ? inv.fiscalId : undefined
    const fromMentions = inv.mentions?.find((m) => canonical.includes(m))
    return fromFiscal ?? fromMentions ?? TAX_ID_FALLBACK[countryCode] ?? 'ID FISCAL'
  } catch {
    return TAX_ID_FALLBACK[countryCode] ?? 'ID FISCAL'
  }
}

export async function loadExportMeta(orgId: string, from: Date, to: Date): Promise<ExportMeta> {
  const org = await db.organization.findUnique({ where: { id: orgId } })
  const pack = await db.countryPack.findUnique({ where: { code: org?.countryCode ?? '' } })
  return {
    orgName: org?.name ?? '',
    legalName: org?.legalName ?? '',
    taxId: org?.taxId ?? '',
    taxIdLabel: taxIdLabelOf(org?.countryCode ?? '', pack?.invoicingJson ?? null),
    rccm: org?.rccm ?? '',
    countryCode: org?.countryCode ?? '',
    currencyCode: org?.currencyCode ?? 'XOF',
    periodLabel: `${fmtDate(from)} — ${fmtDate(to)}`,
  }
}
