// YAHRIA BUSINESS OS V1 — Exports SYSCOHADA au format Excel (exceljs)
// Un classeur par document : balance, grand livre, journaux.
// Conventions : XOF sans décimales (format # ##0), en-tête entité + période.
import ExcelJS from 'exceljs'
import {
  BalanceRow,
  GrandLivreAccount,
  ExportMeta,
  classLabel,
  fmtXOF,
  fmtDate,
} from './ohada'

const MONEY_FMT = '#\\ ##0'

function styleHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2C42' } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = { bottom: { style: 'thin', color: { argb: 'FF64748B' } } }
}

function banner(ws: ExcelJS.Worksheet, meta: ExportMeta, title: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols)
  const t = ws.getCell(1, 1)
  t.value = 'YAHRIA BUSINESS OS — ÉTATS FINANCIERS SYSCOHADA (SYSTÈME NORMAL)'
  t.font = { bold: true, size: 13, color: { argb: 'FF1A2C42' } }
  t.alignment = { horizontal: 'center' }
  ws.mergeCells(2, 1, 2, cols)
  const e = ws.getCell(2, 1)
  e.value = `${meta.legalName} · NCC ${meta.taxId} · RCCM ${meta.rccm} · ${meta.countryCode} · Monnaie : ${meta.currencyCode}`
  e.font = { size: 9, color: { argb: 'FF475569' } }
  e.alignment = { horizontal: 'center' }
  ws.mergeCells(3, 1, 3, cols)
  const p = ws.getCell(3, 1)
  p.value = `${title} — Période : ${meta.periodLabel}`
  p.font = { bold: true, size: 11 }
  p.alignment = { horizontal: 'center' }
}

export async function buildBalanceXlsx(rows: BalanceRow[], meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'YAHRIA Business OS'
  const ws = wb.addWorksheet('Balance générale')
  banner(ws, meta, 'BALANCE GÉNÉRALE DES COMPTES', 7)
  const header = ws.getRow(5)
  header.values = ['Compte', 'Intitulé', 'Classe', 'Mouvements Débit', 'Mouvements Crédit', 'Solde Débiteur', 'Solde Créditeur']
  header.eachCell((c) => styleHeader(c))

  let lastClass = -1
  let r = 6
  for (const row of rows) {
    if (row.klass !== lastClass) {
      lastClass = row.klass
      ws.mergeCells(r, 1, r, 7)
      const cl = ws.getCell(r, 1)
      cl.value = `CLASSE ${row.klass} — ${classLabel(row.klass)}`
      cl.font = { bold: true, size: 9, color: { argb: 'FF334155' } }
      cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
      r++
    }
    ws.getRow(r).values = [row.code, row.name, row.klass, row.totalDebit, row.totalCredit, row.soldeDebiteur, row.soldeCrediteur]
    for (const col of [4, 5, 6, 7]) ws.getCell(r, col).numFmt = MONEY_FMT
    r++
  }
  const totD = rows.reduce((s, x) => s + x.totalDebit, 0)
  const totC = rows.reduce((s, x) => s + x.totalCredit, 0)
  const totSD = rows.reduce((s, x) => s + x.soldeDebiteur, 0)
  const totSC = rows.reduce((s, x) => s + x.soldeCrediteur, 0)
  ws.getRow(r).values = ['TOTAUX', '', '', totD, totC, totSD, totSC]
  const tr = ws.getRow(r)
  tr.font = { bold: true }
  tr.eachCell((c) => {
    c.border = { top: { style: 'double', color: { argb: 'FF1A2C42' } } }
    if (Number(c.col) >= 4) c.numFmt = MONEY_FMT
  })
  // Équilibre INV-ACC-001 rappelé : Σ débit = Σ crédit, Σ soldes D = Σ soldes C
  ws.getCell(r + 2, 1).value =
    totD === totC && totSD === totSC
      ? 'Balance équilibrée : Σ mouvements débits = crédits, Σ soldes débiteurs = créditeurs (INV-ACC-001).'
      : '⚠ Balance déséquilibrée — contactez l\u2019administrateur (INV-ACC-001).'
  ws.getCell(r + 2, 1).font = { italic: true, size: 9, color: { argb: 'FF475569' } }
  ws.columns = [{ width: 12 }, { width: 38 }, { width: 7 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }]
  ws.views = [{ state: 'frozen', ySplit: 5 }]
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function buildGrandLivreXlsx(accounts: GrandLivreAccount[], meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'YAHRIA Business OS'
  const ws = wb.addWorksheet('Grand livre')
  banner(ws, meta, 'GRAND LIVRE DES COMPTES (avec lettrage)', 8)
  let r = 5
  for (const acct of accounts) {
    ws.mergeCells(r, 1, r, 8)
    const h = ws.getCell(r, 1)
    h.value = `Compte ${acct.code} — ${acct.name}   [Classe ${acct.klass}]`
    h.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2C42' } }
    r++
    const header = ws.getRow(r)
    header.values = ['Date', 'Jl', 'Pièce', 'Libellé', 'Débit', 'Crédit', 'Solde', 'Let.']
    header.eachCell((c) => styleHeader(c))
    r++
    for (const row of acct.rows) {
      ws.getRow(r).values = [
        row.date ? fmtDate(row.date) : 'À nouveau',
        row.journal,
        row.reference,
        row.label,
        row.debit || null,
        row.credit || null,
        row.solde,
        row.lettre,
      ]
      for (const col of [5, 6, 7]) ws.getCell(r, col).numFmt = MONEY_FMT
      if (!row.date) ws.getRow(r).font = { italic: true }
      r++
    }
    ws.getRow(r).values = [
      '',
      '',
      '',
      'Totaux du compte',
      acct.totalDebit,
      acct.totalCredit,
      acct.soldeFinal,
      acct.soldeFinal >= 0 ? 'SD' : 'SC',
    ]
    const tr = ws.getRow(r)
    tr.font = { bold: true }
    for (const col of [5, 6, 7]) tr.getCell(col).numFmt = MONEY_FMT
    tr.getCell(4).alignment = { horizontal: 'right' }
    tr.eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: { style: 'thin', color: { argb: 'FF1A2C42' } } }
    })
    r += 2
  }
  ws.getCell(r, 1).value = 'Let. = lettre de lettrage (rapprochement facture ↔ règlement). SD = solde débiteur, SC = solde créditeur.'
  ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF475569' } }
  ws.columns = [{ width: 12 }, { width: 6 }, { width: 16 }, { width: 46 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 6 }]
  ws.views = [{ state: 'frozen', ySplit: 5 }]
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function buildJournauxXlsx(
  journals: Map<string, { label: string; entries: { date: Date; reference: string; description: string; lines: { accountCode: string; accountName: string; debit: number; credit: number }[]; totalDebit: number; totalCredit: number }[]; totalDebit: number; totalCredit: number }>,
  meta: ExportMeta
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'YAHRIA Business OS'
  const ws = wb.addWorksheet('Journaux')
  banner(ws, meta, 'JOURNAUX COMPTABLES', 6)
  let r = 5
  for (const [code, j] of journals) {
    ws.mergeCells(r, 1, r, 6)
    const h = ws.getCell(r, 1)
    h.value = `Journal ${code} — ${j.label}`
    h.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2C42' } }
    r++
    const header = ws.getRow(r)
    header.values = ['Date', 'Pièce', 'Compte', 'Intitulé du compte', 'Débit', 'Crédit']
    header.eachCell((c) => styleHeader(c))
    r++
    for (const e of j.entries) {
      for (const [i, l] of e.lines.entries()) {
        ws.getRow(r).values = [
          i === 0 ? fmtDate(e.date) : '',
          i === 0 ? e.reference : '',
          l.accountCode,
          l.accountName,
          l.debit || null,
          l.credit || null,
        ]
        for (const col of [5, 6]) ws.getCell(r, col).numFmt = MONEY_FMT
        r++
      }
    }
    ws.getRow(r).values = ['', '', '', `Total journal ${code}`, j.totalDebit, j.totalCredit]
    const tr = ws.getRow(r)
    tr.font = { bold: true }
    for (const col of [5, 6]) tr.getCell(col).numFmt = MONEY_FMT
    tr.eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: { style: 'double', color: { argb: 'FF1A2C42' } } }
    })
    r += 2
  }
  ws.getCell(r, 1).value = 'VTE ventes · ACH achats & charges · TRE trésorerie · PAIE paie · OD opérations diverses.'
  ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF475569' } }
  ws.columns = [{ width: 12 }, { width: 16 }, { width: 10 }, { width: 44 }, { width: 16 }, { width: 16 }]
  ws.views = [{ state: 'frozen', ySplit: 5 }]
  return Buffer.from(await wb.xlsx.writeBuffer())
}

// Référence interne — fmtXOF utilisé dans les libellés de contrôle
void fmtXOF
