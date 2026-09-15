// YAHRIA BUSINESS OS V1 — 06_PAIE SYSCOHADA (journal PAIE / SEC-005)
// Clôture de paie conforme au plan comptable OHADA :
//   · Constatation (par salarié) : D 661x (brut) + D 6641 (cotes patronales)
//       / C 4311 (sécurité sociale) + C 4321 (impôt retenu à la source) + C 4221 (net à payer)
//   · Paiement (agrégé)          : D 4221 / C 5211 (virement bancaire)
// Les cotes sociales proviennent EXCLUSIVEMENT du Country Pack national de
// l'organisation (INV-011) — une org du Bénin est paillée selon les paramètres
// du pack BJ (CNSS 15,4 % / 3,6 %), jamais selon ceux d'un autre pays.
// Les barèmes d'impôt sur salaires sont des PARAMÈTRES CONFIGURABLES du
// référentiel : ils doivent être validés par l'expert-comptable à chaque
// loi de finances (ils sont figés dans PayRun.rulesJson à la clôture, pour
// une reproductibilité d'audit complète).
// Écritures APPEND-ONLY (INV-007) : corriger une paie = contre-passation.
import { db } from '@/lib/db'
import { jparse } from './core'

// ── Barèmes mensuels progressifs (marges par tranche, XOF) ──────────────────
export interface TaxBracket { upTo: number | null; rate: number } // null = au-delà
export interface PayrollRules {
  countryCode: string
  packCode: string
  packVersion: string
  sectorCode: string // secteur de l'organisation — hooks contractuels v2 (INV-012)
  socialLabel: string // CNSS (BJ) | CNPS (CI) | IPRES+CSS (SN)
  socialEmployerRate: number
  socialEmployeeRate: number
  taxLabel: string // IFS (BJ) | ITS (CI) | IR (SN)
  scheduleLabel: string
  schedule: TaxBracket[]
  minWage: number
  note: string
}

// Barèmes /12 (référentiel pack — configurable, figé à la clôture dans rulesJson)
const TAX_SCHEDULES: Record<string, { label: string; brackets: TaxBracket[] }> = {
  BJ: {
    label: 'IFS — barème mensuel progressif (Bénin, paramètre pack)',
    brackets: [
      { upTo: 50_000, rate: 0 }, { upTo: 125_000, rate: 0.10 }, { upTo: 208_333, rate: 0.15 },
      { upTo: 416_667, rate: 0.19 }, { upTo: null, rate: 0.30 },
    ],
  },
  CI: {
    label: 'ITS — barème mensuel progressif (Côte d\u2019Ivoire, paramètre pack)',
    brackets: [
      { upTo: 50_000, rate: 0 }, { upTo: 200_000, rate: 0.015 }, { upTo: 450_000, rate: 0.05 },
      { upTo: 1_000_000, rate: 0.10 }, { upTo: null, rate: 0.15 },
    ],
  },
  SN: {
    label: 'IR — barème mensuel progressif (Sénégal, paramètre pack)',
    brackets: [
      { upTo: 52_500, rate: 0 }, { upTo: 125_000, rate: 0.05 }, { upTo: 220_000, rate: 0.08 },
      { upTo: 400_000, rate: 0.10 }, { upTo: 575_000, rate: 0.15 }, { upTo: 950_000, rate: 0.20 },
      { upTo: null, rate: 0.30 },
    ],
  },
}

const DEFAULT_RATES: Record<string, { employer: number; employee: number }> = {
  BJ: { employer: 0.154, employee: 0.036 },
  CI: { employer: 0.125, employee: 0.063 },
  SN: { employer: 0.21, employee: 0.056 },
}

const SOCIAL_LABELS: Record<string, string> = { BJ: 'CNSS', CI: 'CNPS', SN: 'IPRES/CSS' }
const TAX_LABELS: Record<string, string> = { BJ: 'IFS', CI: 'ITS', SN: 'IR' }

/** Impôt progressif par tranches marginales. */
export function progressiveTax(base: number, brackets: TaxBracket[]): number {
  let tax = 0
  let lower = 0
  for (const b of brackets) {
    const upper = b.upTo === null ? Infinity : b.upTo
    const slice = Math.max(0, Math.min(base, upper) - lower)
    tax += slice * b.rate
    if (base <= upper) break
    lower = upper
  }
  return Math.round(tax)
}

/**
 * Paramètres de paie DÉRIVÉS du Country Pack national (INV-011) : les cotes
 * sociales lues dans payrollJson écrasent systématiquement les défauts du
 * référentiel — jamais l'inverse. Un pack étranger ne peut pas fuiter.
 */
export async function payrollRulesFor(orgId: string): Promise<PayrollRules> {
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) throw new Error('Organisation introuvable')
  const pack = await db.countryPack.findUnique({ where: { code: org.countryCode } })
  const cfg = jparse<Record<string, number | string>>(pack?.payrollJson, {})
  const cc = org.countryCode
  const defaults = DEFAULT_RATES[cc] ?? DEFAULT_RATES.BJ
  const schedule = TAX_SCHEDULES[cc] ?? TAX_SCHEDULES.BJ
  const employer = numOr(cfg.cnpsBeninEmployer ?? cfg.cnpsEmployer ?? cfg.ipresEmployer, defaults.employer)
  const cssEmployer = numOr(cfg.cssEmployer, 0) // SN : CSS patronale additionnelle
  const employee = numOr(cfg.cnpsBeninEmployee ?? cfg.cnpsEmployee ?? cfg.ipresEmployee, defaults.employee)
  const minWage = numOr(cfg.minWage, 52_000)
  return {
    countryCode: cc,
    packCode: pack?.code ?? cc,
    packVersion: pack?.version ?? '0.0.0',
    sectorCode: org.sectorCode ?? 'enterprise',
    socialLabel: SOCIAL_LABELS[cc] ?? 'CNSS',
    socialEmployerRate: round4(employer + cssEmployer),
    socialEmployeeRate: round4(employee),
    taxLabel: TAX_LABELS[cc] ?? 'IFS',
    scheduleLabel: schedule.label,
    schedule: schedule.brackets,
    minWage,
    note: 'Paramètres de paie issus du Country Pack national et du référentiel fiscal — à valider par l\u2019expert-comptable à chaque loi de finances (figés à la clôture dans rulesJson).',
  }
}

function numOr(v: unknown, d: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : d
}
function round4(n: number): number { return Math.round(n * 10_000) / 10_000 }

// ── Mapping comptable SYSCOHADA ──────────────────────────────────────────────
export const PAYROLL_ACCOUNTS = {
  salaryDue: { code: '4221', name: 'Personnel, rémunérations dues' },
  social: { code: '4311', name: 'Sécurité sociale' },
  taxWithheld: { code: '4321', name: 'État, impôts sur les rémunérations' },
  employerSocial: { code: '6641', name: 'Cotisations sociales patronales' },
  bank: { code: '5211', name: 'Banques' },
} as const

/** Compte de charge 661x selon le profil du salarié (référentiel OHADA). */
export function expenseAccountOf(contractType: string, department: string): { code: string; name: string } {
  if (contractType === 'CONSULTANT') return { code: '6615', name: 'Honoraires' }
  if (department === 'OPS') return { code: '6611', name: 'Salaires des ouvriers' }
  if (department === 'DIRECTION') return { code: '6613', name: 'Salaires des chefs d\u2019exploitation et de main-d\u2019œuvre' }
  return { code: '6612', name: 'Salaires des employés' }
}

// ── Calcul d'un bulletin ─────────────────────────────────────────────────────
export interface PayslipInput { id: string; code: string; name: string; position: string; contractType: string; department: string; grossSalary: number }
export interface PayslipLine { label: string; base?: number; rate?: number; amount: number; side: 'EMPLOYEE' | 'EMPLOYER' | 'INFO' }
export interface PayslipComputed {
  employeeId: string; employeeCode: string; employeeName: string; position: string
  contractType: string; accountCode: string; accountName: string
  gross: number; socialEmployee: number; socialEmployer: number; tax: number; net: number
  lines: PayslipLine[]
}

export function computePayslip(rules: PayrollRules, e: PayslipInput): PayslipComputed {
  const gross = Math.round(e.grossSalary)
  const socialEmployee = Math.round(gross * rules.socialEmployeeRate)
  const socialEmployer = Math.round(gross * rules.socialEmployerRate)
  const taxable = Math.max(0, gross - socialEmployee) // la cote salariale est déductible
  const tax = progressiveTax(taxable, rules.schedule)
  const net = gross - socialEmployee - tax
  const pct = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, '')} %`
  const lines: PayslipLine[] = [
    { label: 'Salaire brut', base: gross, amount: gross, side: 'INFO' },
    { label: `${rules.socialLabel} part salariale (${pct(rules.socialEmployeeRate)})`, rate: rules.socialEmployeeRate, amount: -socialEmployee, side: 'EMPLOYEE' },
    { label: `Base imposable`, base: taxable, amount: taxable, side: 'INFO' },
    { label: `${rules.taxLabel} (barème progressif)`, amount: -tax, side: 'EMPLOYEE' },
    { label: 'Net à payer', amount: net, side: 'EMPLOYEE' },
    { label: `${rules.socialLabel} part patronale (${pct(rules.socialEmployerRate)})`, rate: rules.socialEmployerRate, amount: socialEmployer, side: 'EMPLOYER' },
  ]
  const acc = expenseAccountOf(e.contractType, e.department)
  return {
    employeeId: e.id, employeeCode: e.code, employeeName: e.name, position: e.position,
    contractType: e.contractType, accountCode: acc.code, accountName: acc.name,
    gross, socialEmployee, socialEmployer, tax, net, lines,
  }
}

// ── Vérification d'équilibre (INV-ACC-001 appliqué à la paie) ───────────────
export function payslipBalanced(p: PayslipComputed): boolean {
  const debit = p.gross + p.socialEmployer
  const credit = p.socialEmployee + p.socialEmployer + p.tax + p.net
  return debit === credit
}

/** Dernier jour du mois (UTC) — date comptable de la clôture. */
export function periodDate(period: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) throw new Error('Période invalide (format attendu : YYYY-MM)')
  const y = Number(m[1]); const mo = Number(m[2])
  if (mo < 1 || mo > 12) throw new Error('Période invalide (mois 01..12)')
  return new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999))
}

export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return period
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return `${mois[Number(m[2]) - 1]} ${m[1]}`
}
