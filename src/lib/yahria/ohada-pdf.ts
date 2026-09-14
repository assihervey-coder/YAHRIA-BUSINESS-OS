// YAHRIA BUSINESS OS V1 — Exports SYSCOHADA au format PDF (pdf-lib)
// Rendu tableur sobre (en-tête entité, période, zebra, totaux, pagination).
// Helvetica/WinAnsi couvre le français ; XOF sans décimales.
// Schéma de bornes : n colonnes ↔ n+1 frontières (bords gauches + bord droit).
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'
import {
  BalanceRow,
  GrandLivreAccount,
  ExportMeta,
  classLabel,
  fmtXOF,
  fmtDate,
} from './ohada'

const INK = rgb(0.08, 0.13, 0.2)
const MUTED = rgb(0.35, 0.42, 0.5)
const HEAD_BG = rgb(0.1, 0.17, 0.26)
const ZEBRA = rgb(0.94, 0.96, 0.98)
const CLASS_BG = rgb(0.89, 0.91, 0.94)

const A4: [number, number] = [595.28, 841.89]
const M = 40 // marges

/**
 * Sanitize WinAnsi : les polices standard PDF n'encodent que WinAnsi.
 * Les données métier (descriptions, libellés) peuvent contenir des espaces
 * fines (U+202F), insécables (U+00A0), tirets exotiques, etc.
 */
function win(s: string): string {
  return String(s)
    .replace(/[\u202f\u00a0\u2007\u2009\u200b]/g, ' ')
    .replace(/[\u2012\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x00-\xff\u2014\u00b7\u00c0-\u017f]/g, '?')
}

interface TableCtx {
  doc: PDFDocument
  page: PDFPage
  y: number
  pageNum: number
  font: PDFFont
  bold: PDFFont
  footerPages: Set<PDFPage>
  drawFooter: () => void
}

function newPage(ctx: TableCtx, cols: number[], headerRow: string[], aligns: ('l' | 'r')[]): void {
  ctx.page = ctx.doc.addPage(A4)
  ctx.pageNum++
  ctx.y = A4[1] - M
  drawTableHeader(ctx, cols, headerRow, aligns)
  ctx.drawFooter()
}

/** En-tête de tableau. `cols` : n+1 frontières pour n colonnes. */
function drawTableHeader(ctx: TableCtx, cols: number[], headerRow: string[], aligns: ('l' | 'r')[] = []): void {
  const { page, bold } = ctx
  page.drawRectangle({ x: M, y: ctx.y - 14, width: A4[0] - 2 * M, height: 18, color: HEAD_BG })
  headerRow.forEach((h, i) => {
    const left = cols[i]
    const right = cols[i + 1]
    const width = right - left
    const textWidth = bold.widthOfTextAtSize(h, 7.5)
    const alignRight = aligns[i] === 'r'
    page.drawText(h, {
      x: alignRight ? right - 4 - textWidth : left + 4,
      y: ctx.y - 10,
      size: 7.5,
      font: bold,
      color: rgb(1, 1, 1),
      maxWidth: width,
    })
  })
  ctx.y -= 22
}

function cell(ctx: TableCtx, x: number, width: number, text: string, size: number, font: PDFFont, align: 'l' | 'r' = 'l', color = INK): void {
  const t = win(text)
  const w = font.widthOfTextAtSize(t, size)
  ctx.page.drawText(t, {
    x: align === 'r' ? x + width - 4 - w : x + 4,
    y: ctx.y,
    size,
    font,
    color,
  })
}

function banner(page: PDFPage, font: PDFFont, bold: PDFFont, meta: ExportMeta, title: string): void {
  page.drawText('YAHRIA BUSINESS OS — ÉTATS FINANCIERS SYSCOHADA (SYSTÈME NORMAL)', {
    x: M, y: A4[1] - M - 8, size: 11, font: bold, color: HEAD_BG,
  })
  page.drawText(win(`${meta.legalName} · ${meta.taxIdLabel} ${meta.taxId} · RCCM ${meta.rccm} · ${meta.countryCode} · Monnaie : ${meta.currencyCode}`), {
    x: M, y: A4[1] - M - 22, size: 7.5, font, color: MUTED,
  })
  page.drawText(win(`${title} — Période : ${meta.periodLabel}`), {
    x: M, y: A4[1] - M - 36, size: 9.5, font: bold, color: INK,
  })
}

async function newDoc(meta: ExportMeta, title: string) {
  const doc = await PDFDocument.create()
  doc.setTitle(`${title} — ${meta.legalName}`)
  doc.setAuthor('YAHRIA Business OS')
  doc.setSubject('États financiers SYSCOHADA')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage(A4)
  banner(page, font, bold, meta, title)
  const ctx: TableCtx = {
    doc, page, y: A4[1] - M - 52, pageNum: 1, font, bold,
    footerPages: new Set<PDFPage>(),
    drawFooter: () => {
      // Garde anti-doublon : chaque page reçoit exactement un pied de page
      if (ctx.footerPages.has(ctx.page)) return
      ctx.footerPages.add(ctx.page)
      ctx.page.drawText('Document généré par YAHRIA Business OS — modèle SYSCOHADA révisé, système normal', {
        x: M, y: M - 8, size: 6.5, font: ctx.font, color: MUTED,
      })
      const pn = `Page ${ctx.pageNum}`
      ctx.page.drawText(pn, { x: A4[0] - M - ctx.bold.widthOfTextAtSize(pn, 7), y: M - 8, size: 7, font: ctx.bold, color: MUTED })
    },
  }
  // La page 1 porte aussi son pied de page (sinon absent sur documents multi-pages)
  ctx.drawFooter()
  return { doc, ctx }
}

// ── Balance générale ────────────────────────────────────────────────────────
export async function buildBalancePdf(rows: BalanceRow[], meta: ExportMeta): Promise<Buffer> {
  const { doc, ctx } = await newDoc(meta, 'Balance générale')
  // 7 colonnes → 8 frontières : Compte | Intitulé | Cl. | Mvt D | Mvt C | Solde D | Solde C
  const cols = [M, M + 44, M + 194, M + 204, M + 281, M + 358, M + 435, A4[0] - M]
  const header = ['Compte', 'Intitulé', 'Cl.', 'Mvt Débit', 'Mvt Crédit', 'Solde Déb.', 'Solde Créd.']
  const aligns: ('l' | 'r')[] = ['l', 'l', 'l', 'r', 'r', 'r', 'r']
  drawTableHeader(ctx, cols, header, aligns)

  let lastClass = -1
  for (const row of rows) {
    if (ctx.y < M + 40) newPage(ctx, cols, header, aligns)
    if (row.klass !== lastClass) {
      lastClass = row.klass
      ctx.page.drawRectangle({ x: M, y: ctx.y - 4, width: A4[0] - 2 * M, height: 14, color: CLASS_BG })
      cell(ctx, cols[0], cols[1] - cols[0], `CLASSE ${row.klass} — ${classLabel(row.klass)}`, 7, ctx.bold)
      ctx.y -= 18
      if (ctx.y < M + 40) newPage(ctx, cols, header, aligns)
    }
    ctx.page.drawRectangle({ x: M, y: ctx.y - 4, width: A4[0] - 2 * M, height: 13, color: ZEBRA })
    cell(ctx, cols[0], cols[1] - cols[0], row.code, 7.5, ctx.bold)
    const name = row.name.length > 36 ? `${row.name.slice(0, 35)}…` : row.name
    cell(ctx, cols[1], cols[2] - cols[1], name, 7.5, ctx.font)
    cell(ctx, cols[2], cols[3] - cols[2], String(row.klass), 7.5, ctx.font, 'l')
    cell(ctx, cols[3], cols[4] - cols[3], fmtXOF(row.totalDebit), 7.5, ctx.font, 'r')
    cell(ctx, cols[4], cols[5] - cols[4], fmtXOF(row.totalCredit), 7.5, ctx.font, 'r')
    cell(ctx, cols[5], cols[6] - cols[5], fmtXOF(row.soldeDebiteur), 7.5, ctx.font, 'r')
    cell(ctx, cols[6], cols[7] - cols[6], fmtXOF(row.soldeCrediteur), 7.5, ctx.font, 'r')
    ctx.y -= 14
  }
  if (ctx.y < M + 70) newPage(ctx, cols, header, aligns)
  const totD = rows.reduce((s, x) => s + x.totalDebit, 0)
  const totC = rows.reduce((s, x) => s + x.totalCredit, 0)
  const totSD = rows.reduce((s, x) => s + x.soldeDebiteur, 0)
  const totSC = rows.reduce((s, x) => s + x.soldeCrediteur, 0)
  ctx.y -= 6
  ctx.page.drawLine({ start: { x: M, y: ctx.y + 10 }, end: { x: A4[0] - M, y: ctx.y + 10 }, thickness: 1, color: HEAD_BG })
  cell(ctx, M, cols[1] - M, 'TOTAUX', 8, ctx.bold)
  cell(ctx, cols[3], cols[4] - cols[3], fmtXOF(totD), 8, ctx.bold, 'r')
  cell(ctx, cols[4], cols[5] - cols[4], fmtXOF(totC), 8, ctx.bold, 'r')
  cell(ctx, cols[5], cols[6] - cols[5], fmtXOF(totSD), 8, ctx.bold, 'r')
  cell(ctx, cols[6], cols[7] - cols[6], fmtXOF(totSC), 8, ctx.bold, 'r')
  ctx.y -= 16
  const balanced = totD === totC && totSD === totSC
  ctx.page.drawText(
    balanced
      ? 'Balance équilibrée : total mouvements débits = crédits, soldes débiteurs = créditeurs (INV-ACC-001).'
      : 'ATTENTION : balance déséquilibrée — contactez l\'administrateur (INV-ACC-001).',
    { x: M, y: ctx.y, size: 7.5, font: ctx.font, color: MUTED }
  )
  ctx.drawFooter()
  return Buffer.from(await doc.save())
}

// ── Grand livre ─────────────────────────────────────────────────────────────
export async function buildGrandLivrePdf(accounts: GrandLivreAccount[], meta: ExportMeta): Promise<Buffer> {
  const { doc, ctx } = await newDoc(meta, 'Grand livre')
  // 8 colonnes → 9 frontières : Date | Jl | Pièce | Libellé | Débit | Crédit | Solde | Let.
  const cols = [M, M + 44, M + 64, M + 134, M + 304, M + 369, M + 434, M + 495, A4[0] - M]
  const header = ['Date', 'Jl', 'Pièce', 'Libellé', 'Débit', 'Crédit', 'Solde', 'Let.']
  const aligns: ('l' | 'r')[] = ['l', 'l', 'l', 'l', 'r', 'r', 'r', 'r']
  let first = true

  for (const acct of accounts) {
    if (ctx.y < M + 90) newPage(ctx, cols, header, aligns)
    ctx.page.drawText(win(`Compte ${acct.code} — ${acct.name}  [Classe ${acct.klass}]`), {
      x: M, y: ctx.y - 4, size: 8.5, font: ctx.bold, color: HEAD_BG,
    })
    ctx.y -= 18
    drawTableHeader(ctx, cols, header, aligns)
    first = false
    for (const row of acct.rows) {
      if (ctx.y < M + 30) newPage(ctx, cols, header, aligns)
      if (row.date) ctx.page.drawRectangle({ x: M, y: ctx.y - 4, width: A4[0] - 2 * M, height: 13, color: ZEBRA })
      cell(ctx, cols[0], cols[1] - cols[0], row.date ? fmtDate(row.date) : 'À nouveau', 7, ctx.font)
      cell(ctx, cols[1], cols[2] - cols[1], row.journal, 7, ctx.font)
      cell(ctx, cols[2], cols[3] - cols[2], row.reference.length > 14 ? `${row.reference.slice(0, 13)}…` : row.reference, 7, ctx.font)
      const label = row.label.length > 34 ? `${row.label.slice(0, 33)}…` : row.label
      cell(ctx, cols[3], cols[4] - cols[3], label, 7, ctx.font)
      cell(ctx, cols[4], cols[5] - cols[4], row.debit ? fmtXOF(row.debit) : '', 7, ctx.font, 'r')
      cell(ctx, cols[5], cols[6] - cols[5], row.credit ? fmtXOF(row.credit) : '', 7, ctx.font, 'r')
      cell(ctx, cols[6], cols[7] - cols[6], fmtXOF(row.solde), 7, ctx.font, 'r')
      cell(ctx, cols[7], cols[8] - cols[7], row.lettre, 7, ctx.bold, 'r')
      ctx.y -= 13
    }
    if (ctx.y < M + 40) newPage(ctx, cols, header, aligns)
    cell(ctx, cols[3], cols[4] - cols[3], 'Totaux du compte', 7.5, ctx.bold, 'r')
    cell(ctx, cols[4], cols[5] - cols[4], fmtXOF(acct.totalDebit), 7.5, ctx.bold, 'r')
    cell(ctx, cols[5], cols[6] - cols[5], fmtXOF(acct.totalCredit), 7.5, ctx.bold, 'r')
    cell(ctx, cols[6], cols[7] - cols[6], fmtXOF(acct.soldeFinal), 7.5, ctx.bold, 'r')
    cell(ctx, cols[7], cols[8] - cols[7], acct.soldeFinal >= 0 ? 'SD' : 'SC', 7.5, ctx.bold, 'r')
    ctx.y -= 22
  }
  void first
  ctx.page.drawText('Let. = lettre de lettrage (rapprochement facture-reglement). SD = solde débiteur, SC = solde créditeur.', {
    x: M, y: Math.max(ctx.y, M + 12), size: 6.5, font: ctx.font, color: MUTED,
  })
  ctx.drawFooter()
  return Buffer.from(await doc.save())
}

// ── Journaux ────────────────────────────────────────────────────────────────
export async function buildJournauxPdf(
  journals: Map<string, { label: string; entries: { date: Date; reference: string; description: string; lines: { accountCode: string; accountName: string; debit: number; credit: number }[]; totalDebit: number; totalCredit: number }[]; totalDebit: number; totalCredit: number }>,
  meta: ExportMeta
): Promise<Buffer> {
  const { doc, ctx } = await newDoc(meta, 'Journaux comptables')
  // 7 colonnes → 8 frontières : Date | Pièce | Compte | Intitulé | Libellé | Débit | Crédit
  const cols = [M, M + 44, M + 108, M + 152, M + 307, M + 407, M + 461, A4[0] - M]
  const header = ['Date', 'Pièce', 'Compte', 'Intitulé du compte', 'Libellé', 'Débit', 'Crédit']
  const aligns: ('l' | 'r')[] = ['l', 'l', 'l', 'l', 'l', 'r', 'r']
  let first = true

  for (const [code, j] of journals) {
    if (ctx.y < M + 100) newPage(ctx, cols, header, aligns)
    ctx.page.drawText(win(`Journal ${code} — ${j.label}`), { x: M, y: ctx.y - 4, size: 8.5, font: ctx.bold, color: HEAD_BG })
    ctx.y -= 18
    drawTableHeader(ctx, cols, header, aligns)
    first = false
    for (const e of j.entries) {
      e.lines.forEach((l, i) => {
        if (ctx.y < M + 30) newPage(ctx, cols, header, aligns)
        if (i === 0) ctx.page.drawRectangle({ x: M, y: ctx.y - 4, width: A4[0] - 2 * M, height: 13, color: ZEBRA })
        cell(ctx, cols[0], cols[1] - cols[0], i === 0 ? fmtDate(e.date) : '', 7, ctx.font)
        cell(ctx, cols[1], cols[2] - cols[1], i === 0 ? e.reference : '', 7, ctx.font)
        cell(ctx, cols[2], cols[3] - cols[2], l.accountCode, 7, ctx.font)
        const name = l.accountName.length > 28 ? `${l.accountName.slice(0, 27)}…` : l.accountName
        cell(ctx, cols[3], cols[4] - cols[3], name, 7, ctx.font)
        const desc = e.description.length > 26 ? `${e.description.slice(0, 25)}…` : e.description
        cell(ctx, cols[4], cols[5] - cols[4], i === 0 ? desc : '', 7, ctx.font)
        cell(ctx, cols[5], cols[6] - cols[5], l.debit ? fmtXOF(l.debit) : '', 7, ctx.font, 'r')
        cell(ctx, cols[6], cols[7] - cols[6], l.credit ? fmtXOF(l.credit) : '', 7, ctx.font, 'r')
        ctx.y -= 13
      })
    }
    if (ctx.y < M + 40) newPage(ctx, cols, header, aligns)
    cell(ctx, cols[3], cols[4] - cols[3], `Total journal ${code}`, 7.5, ctx.bold, 'r')
    cell(ctx, cols[5], cols[6] - cols[5], fmtXOF(j.totalDebit), 7.5, ctx.bold, 'r')
    cell(ctx, cols[6], cols[7] - cols[6], fmtXOF(j.totalCredit), 7.5, ctx.bold, 'r')
    ctx.y -= 22
  }
  void first
  ctx.page.drawText('VTE ventes · ACH achats & charges · TRE trésorerie · PAIE paie · OD opérations diverses.', {
    x: M, y: Math.max(ctx.y, M + 12), size: 6.5, font: ctx.font, color: MUTED,
  })
  ctx.drawFooter()
  return Buffer.from(await doc.save())
}
