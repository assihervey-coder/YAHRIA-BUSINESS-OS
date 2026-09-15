// YAHRIA BUSINESS OS V1 — Bulletin de paie PDF par salarié (pdf-lib)
// Format OHADA pays : en-tête employeur/salarié, rubriques Gains/Retenues/
// Charge patronale, NET À PAYER encadré, mentions légales (pack national),
// bandeau d'annulation si le run est contre-passé, sceau d'audit.
// Les paramètres (cotes, barème) proviennent du rulesJson FIGÉ à la clôture —
// le bulletin reflète exactement les paramètres qui ont produit le calcul.
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib'
import { fmtXOF } from './ohada'

const INK = rgb(0.08, 0.13, 0.2)
const MUTED = rgb(0.35, 0.42, 0.5)
const HEAD_BG = rgb(0.1, 0.17, 0.26)
const SOFT = rgb(0.94, 0.96, 0.98)
const LINE = rgb(0.78, 0.82, 0.87)
const RED_BG = rgb(0.96, 0.9, 0.88)

const A4: [number, number] = [595.28, 841.89]
const M = 44

/** Sanitize WinAnsi (polices standard PDF) — même discipline que ohada-pdf. */
function win(s: string): string {
  return String(s)
    .replace(/[\u202f\u00a0\u2007\u2009\u200b]/g, ' ')
    .replace(/[\u2012\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x00-\xff\u2014\u00b7\u00c0-\u017f]/g, '?')
}

export interface PayslipPdfSlip {
  employeeCode: string
  employeeName: string
  position: string
  contractType: string
  accountCode: string
  gross: number
  cnssEmployee: number
  cnssEmployer: number
  tax: number
  net: number
  lines: { label: string; base?: number; rate?: number; amount: number; side: 'EMPLOYEE' | 'EMPLOYER' | 'INFO' }[]
}

export interface PayslipPdfData {
  slip: PayslipPdfSlip
  run: { reference: string; period: string; periodLabel: string; status: string; countryPackCode: string; postedAt: string; headcount: number }
  org: { name: string; legalName: string; taxIdLabel: string; taxId: string; rccm: string; countryCode: string; currencyCode: string }
  rules: { socialLabel: string; taxLabel: string; scheduleLabel: string }
  reversal?: { reason: string; reversedAt: string; reversedBy: string; evidenceRef?: string } | null
}

function f2(n: number): string {
  // Montant avec séparateurs, 0 décimales (XOF) — via fmtXOF (purge U+202F/U+00A0,
  // non encodables en WinAnsi par les polices PDF standard)
  return fmtXOF(n)
}

export async function buildPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  const { slip, run, org, rules } = data
  const doc = await PDFDocument.create()
  doc.setTitle(`Bulletin de paie — ${slip.employeeName} — ${run.periodLabel}`)
  doc.setAuthor('YAHRIA Business OS')
  doc.setSubject('Bulletin de paie SYSCOHADA')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage(A4)
  const W = A4[0] - 2 * M
  let y = A4[1] - M

  // ── Bandeau d'annulation (run contre-passé) ──
  if (run.status === 'REVERSED') {
    page.drawRectangle({ x: M, y: y - 26, width: W, height: 26, color: RED_BG, borderColor: rgb(0.7, 0.25, 0.2), borderWidth: 1 })
    page.drawText(win('BULLETIN ANNULÉ PAR CONTRE-PASSATION — SANS VALIDEUR COMPTABLE'), {
      x: M + 8, y: y - 18, size: 10, font: bold, color: rgb(0.6, 0.15, 0.1),
    })
    y -= 40
  }

  // ── En-tête ──
  page.drawText(win('BULLETIN DE PAIE'), { x: M, y: y - 4, size: 16, font: bold, color: HEAD_BG })
  page.drawText(win(`${org.legalName || org.name}`), { x: M, y: y - 20, size: 10, font: bold, color: INK })
  page.drawText(win(`${org.taxIdLabel} ${org.taxId} · RCCM ${org.rccm} · ${org.countryCode} · Monnaie : ${org.currencyCode}`), {
    x: M, y: y - 32, size: 7.5, font, color: MUTED,
  })
  const refTxt = win(`Clôture ${run.reference}`)
  page.drawText(refTxt, { x: A4[0] - M - bold.widthOfTextAtSize(refTxt, 8), y: y - 4, size: 8, font: bold, color: MUTED })
  y -= 46

  // ── Cadre salarié ──
  page.drawRectangle({ x: M, y: y - 62, width: W, height: 62, color: SOFT, borderColor: LINE, borderWidth: 0.7 })
  const colMid = M + W / 2
  const kv = (x: number, yy: number, k: string, v: string, b = false) => {
    page.drawText(win(k), { x, y: yy, size: 7.5, font, color: MUTED })
    page.drawText(win(v), { x: x + 78, y: yy, size: 8.5, font: b ? bold : font, color: INK })
  }
  kv(M + 8, y - 16, 'Salarié', slip.employeeName, true)
  kv(M + 8, y - 30, 'Matricule', slip.employeeCode)
  kv(M + 8, y - 44, 'Poste', slip.position)
  kv(M + 8, y - 56, 'Contrat', slip.contractType)
  kv(colMid, y - 16, 'Période', run.periodLabel, true)
  kv(colMid, y - 30, 'Payé le', new Date(run.postedAt).toLocaleDateString('fr-FR') + ' (virement)')
  kv(colMid, y - 44, 'Compte de charge', `${slip.accountCode} (classe 6 — SYSCOHADA)`)
  kv(colMid, y - 56, 'Couverture pack', `${run.countryPackCode} (INV-011)`)
  y -= 78

  // ── Tableau des rubriques : Désignation | Base | Taux | Gains | Retenues | Charge patr. ──
  const cols = [M, M + 216, M + 268, M + 322, M + 378, M + 444, A4[0] - M]
  page.drawRectangle({ x: M, y: y - 14, width: W, height: 18, color: HEAD_BG })
  const heads: [string, 'l' | 'r'][] = [['Désignation', 'l'], ['Base', 'r'], ['Taux', 'r'], ['Gains', 'r'], ['Retenues', 'r'], ['Charge patr.', 'r']]
  heads.forEach(([h, a], i) => {
    const left = cols[i], right = cols[i + 1]
    const t = win(h)
    const w = bold.widthOfTextAtSize(t, 7.5)
    page.drawText(t, { x: a === 'r' ? right - 4 - w : left + 4, y: y - 10, size: 7.5, font: bold, color: rgb(1, 1, 1) })
  })
  y -= 26

  const cell = (i: number, text: string, size = 8, b = false, color = INK) => {
    const t = win(text)
    const w = (b ? bold : font).widthOfTextAtSize(t, size)
    page.drawText(t, { x: cols[i + 1] - 4 - w, y, size, font: b ? bold : font, color }) // colonnes numériques alignées à droite
  }
  const rowLine = () => page.drawLine({ start: { x: M, y: y - 3 }, end: { x: A4[0] - M, y: y - 3 }, thickness: 0.4, color: LINE })

  // Lignes du calcul figé dans linesJson (le "Net à payer" est rendu en bloc séparé)
  let totalRetenues = 0
  let totalPatronal = 0
  for (const l of slip.lines) {
    if (l.side === 'EMPLOYEE' && l.label.toLowerCase().includes('net à payer')) continue
    if (l.side === 'EMPLOYER') totalPatronal += l.amount
    if (l.side === 'EMPLOYEE' && !l.label.toLowerCase().includes('net à payer')) totalRetenues += Math.abs(l.amount)
    rowLine()
    const isBaseRow = l.side === 'INFO' && (l.label.toLowerCase().includes('base imposable'))
    const isBrut = l.label.toLowerCase().includes('salaire brut')
    // Désignation
    page.drawText(win(l.label), { x: cols[0] + 4, y, size: isBrut ? 8.5 : 8, font: isBrut ? bold : font, color: INK })
    if (isBaseRow || isBrut) cell(1, f2(l.base ?? l.amount), 8, isBrut)
    if (l.rate !== undefined) cell(2, `${(l.rate * 100).toFixed(1).replace(/\.0$/, '')} %`)
    if (isBrut) cell(3, f2(l.amount), 8, true)
    else if (l.side === 'EMPLOYEE') cell(4, f2(Math.abs(l.amount)))
    else if (l.side === 'EMPLOYER') cell(5, f2(l.amount))
    if (isBrut) page.drawRectangle({ x: M, y: y - 3, width: W, height: 15, color: SOFT, opacity: 0.55 })
    y -= 16
  }
  // Ligne de synthèse des retenues
  rowLine()
  page.drawText(win('Total retenues salariales'), { x: cols[0] + 4, y, size: 8, font: bold, color: INK })
  cell(4, f2(totalRetenues), 8, true)
  y -= 16
  rowLine()
  page.drawText(win(`Coût total employeur (brut + ${rules.socialLabel} patronale)`), { x: cols[0] + 4, y, size: 8, font: bold, color: INK })
  cell(5, f2(slip.gross + slip.cnssEmployer), 8, true)
  y -= 24

  // ── Bloc NET À PAYER ──
  const netBoxH = 34
  page.drawRectangle({ x: M, y: y - netBoxH, width: W, height: netBoxH, color: HEAD_BG })
  page.drawText(win('NET À PAYER'), { x: M + 10, y: y - netBoxH + 12, size: 12, font: bold, color: rgb(1, 1, 1) })
  const netTxt = win(`${f2(slip.net)} ${org.currencyCode}`)
  page.drawText(win(netTxt), { x: A4[0] - M - 10 - bold.widthOfTextAtSize(netTxt, 15), y: y - netBoxH + 10, size: 15, font: bold, color: rgb(1, 1, 1) })
  y -= netBoxH + 18

  // ── Mentions légales ──
  const mentions = [
    `Organisme social : ${rules.socialLabel} — parts salariale et patronale dérivées du Country Pack ${run.countryPackCode} (INV-011).`,
    `Impôt sur salaires : ${rules.taxLabel} — ${rules.scheduleLabel}. Base imposable : brut − part salariale ${rules.socialLabel}.`,
    'Virement bancaire au crédit du compte du salarié — écritures journal PAIE : D 661x + D 6641 / C 4311 + C 4321 + C 4221, puis D 4221 / C 5211.',
    'Paramètres figés à la clôture dans rulesJson (reproductibilité d' + "'" + 'audit). Document généré par YAHRIA Business OS.',
  ]
  page.drawText(win('Mentions'), { x: M, y, size: 8, font: bold, color: HEAD_BG })
  y -= 12
  for (const m of mentions) {
    for (const chunk of wrap(win(m), font, 7, W - 8)) {
      page.drawText(chunk, { x: M + 4, y, size: 7, font, color: MUTED })
      y -= 10
    }
  }
  y -= 6

  // ── Contre-passation : motif + sceau ──
  if (data.reversal) {
    page.drawRectangle({ x: M, y: y - 44, width: W, height: 44, color: RED_BG, borderColor: rgb(0.7, 0.25, 0.2), borderWidth: 0.8 })
    page.drawText(win('Contre-passation — bulletin annulé'), { x: M + 8, y: y - 16, size: 8.5, font: bold, color: rgb(0.6, 0.15, 0.1) })
    page.drawText(win(`Motif : ${data.reversal.reason}`), { x: M + 8, y: y - 28, size: 7.5, font, color: INK, maxWidth: W - 16 })
    page.drawText(win(`Le ${new Date(data.reversal.reversedAt).toLocaleString('fr-FR')} par ${data.reversal.reversedBy}${data.reversal.evidenceRef ? ` · preuve ${data.reversal.evidenceRef}` : ''}`), {
      x: M + 8, y: y - 39, size: 7, font, color: MUTED,
    })
    y -= 56
  }

  // ── Pied / sceau d'audit ──
  page.drawLine({ start: { x: M, y: M + 14 }, end: { x: A4[0] - M, y: M + 14 }, thickness: 0.6, color: LINE })
  page.drawText(win(`Bulletin ${slip.employeeCode} · ${run.reference} · édité le ${new Date().toLocaleString('fr-FR')} · YAHRIA Business OS — journal PAIE SYSCOHADA (système normal)`), {
    x: M, y: M + 2, size: 6.5, font, color: MUTED,
  })
  return Buffer.from(await doc.save())
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      out.push(line)
      line = w
    } else line = candidate
  }
  if (line) out.push(line)
  return out
}
