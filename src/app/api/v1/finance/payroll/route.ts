// YAHRIA BUSINESS OS V1 — 06_PAIE : clôture SYSCOHADA (GET/POST /api/v1/finance/payroll)
// GET  : paramètres de paie du pack national (INV-011) + runs + personnel actif
// POST : clôture de paie d'une période (YYYY-MM) — bulletins + écritures PAIE
//        double-partie (constatation par salarié + paiement agrégé), transaction
//        système. L'orgId/tenantId proviennent EXCLUSIVEMENT de la session —
//        jamais du corps (INV-001). Une période clôturée est immuable :
//        ré-clôture refusée, correction par contre-passation (INV-007).
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/yahria/auth'
import { db, dbUnscoped } from '@/lib/db'
import { audit } from '@/lib/yahria/audit'
import {
  payrollRulesFor, computePayslip, payslipBalanced, periodDate, periodLabel,
  PAYROLL_ACCOUNTS,
} from '@/lib/yahria/payroll'
import { evaluateSectorPayroll } from '@/lib/yahria/sectors/registry'

export async function GET(req: NextRequest) {
  return withAuth(req, 'finance.read', async (s) => {
    const rules = await payrollRulesFor(s.orgId)
    const runs = await db.payRun.findMany({
      orderBy: { period: 'desc' },
      include: { payslips: { orderBy: { employeeName: 'asc' } } },
    })
    const employees = await db.employee.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, position: true, department: true, contractType: true, grossSalary: true, currency: true },
    })
    return { rules, runs, employees }
  })
}

export async function POST(req: NextRequest) {
  return withAuth(req, 'finance.write', async (s) => {
    const body = await req.json().catch(() => ({}))
    const period = String((body as { period?: string }).period ?? '').trim()
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Période invalide (format attendu : YYYY-MM)')

    const runsOfPeriod = await db.payRun.findMany({ where: { orgId: s.orgId, period } })
    const posted = runsOfPeriod.find((r) => r.status === 'POSTED')
    if (posted) {
      throw new Error(`INV-PAIE : la paie ${periodLabel(period)} est déjà clôturée (${posted.reference}) — une clôture est immuable, toute correction passe par une contre-passation`)
    }
    // Période contre-passée (runs REVERSED historisés) : re-clôture corrigée
    // autorisée — nouveau run, référence suffixée -R2, -R3… (INV-PAIE-REV2)
    const reversalCount = runsOfPeriod.length
    const suffix = reversalCount > 0 ? `-R${reversalCount + 1}` : ''

    const rules = await payrollRulesFor(s.orgId)
    const employees = await db.employee.findMany({ where: { status: 'ACTIVE' }, orderBy: { code: 'asc' } })
    if (employees.length === 0) throw new Error('Aucun employé actif — renseignez le personnel avant de clôturer la paie')

    const slips = employees.map((e) => computePayslip(rules, {
      id: e.id, code: e.code, name: e.name, position: e.position,
      contractType: e.contractType, department: e.department, grossSalary: e.grossSalary,
    }))
    const unbalanced = slips.find((p) => !payslipBalanced(p))
    if (unbalanced) throw new Error(`INV-ACC-001 : bulletin déséquilibré pour ${unbalanced.employeeName} — clôture refusée`)

    const totals = {
      gross: slips.reduce((a, p) => a + p.gross, 0),
      socialEmployee: slips.reduce((a, p) => a + p.socialEmployee, 0),
      socialEmployer: slips.reduce((a, p) => a + p.socialEmployer, 0),
      tax: slips.reduce((a, p) => a + p.tax, 0),
      net: slips.reduce((a, p) => a + p.net, 0),
    }
    const entryDate = periodDate(period)
    const reference = `PAIE-${period}-${s.orgId.slice(0, 8).toUpperCase()}${suffix}`

    // Hook sectoriel v2 (INV-012/013) : constats consultatifs — jamais bloquants
    const sectorFindings = evaluateSectorPayroll(rules.sectorCode, {
      countryCode: rules.countryCode, period, headcount: slips.length,
      grossTotal: totals.gross, currency: 'XOF',
    })

    // Transaction SYSTÈME : le périmètre (orgId) provient de la session —
    // l'écriture ne peut donc jamais atterrir dans une autre organisation.
    const payRunId = await dbUnscoped.$transaction(async (tx) => {
      const run = await tx.payRun.create({
        data: {
          orgId: s.orgId, reference, period, status: 'POSTED',
          headcount: slips.length,
          grossTotal: totals.gross, cnssEmployeeTotal: totals.socialEmployee,
          cnssEmployerTotal: totals.socialEmployer, taxTotal: totals.tax, netTotal: totals.net,
          currency: 'XOF', countryPackCode: rules.packCode,
          rulesJson: JSON.stringify({ rules, accounts: PAYROLL_ACCOUNTS }),
        },
      })
      for (const [i, p] of slips.entries()) {
        const slip = await tx.payslip.create({
          data: {
            orgId: s.orgId, payRunId: run.id, employeeId: p.employeeId,
            employeeCode: p.employeeCode, employeeName: p.employeeName, position: p.position,
            contractType: p.contractType, accountCode: p.accountCode,
            gross: p.gross, cnssEmployee: p.socialEmployee, cnssEmployer: p.socialEmployer,
            tax: p.tax, net: p.net, linesJson: JSON.stringify(p.lines),
          },
        })
        const entry = await tx.journalEntry.create({
          data: {
            orgId: s.orgId, entryDate, reference: `${reference}/P${i + 1}`,
            description: `Paie ${periodLabel(period)} — ${p.employeeName} (constatation)`,
            source: 'PAYROLL', sourceId: slip.id, posted: true,
            lines: { create: [
              { accountCode: p.accountCode, accountName: p.accountName, debit: p.gross, credit: 0 },
              { accountCode: PAYROLL_ACCOUNTS.employerSocial.code, accountName: PAYROLL_ACCOUNTS.employerSocial.name, debit: p.socialEmployer, credit: 0 },
              { accountCode: PAYROLL_ACCOUNTS.social.code, accountName: PAYROLL_ACCOUNTS.social.name, debit: 0, credit: p.socialEmployee + p.socialEmployer },
              { accountCode: PAYROLL_ACCOUNTS.taxWithheld.code, accountName: PAYROLL_ACCOUNTS.taxWithheld.name, debit: 0, credit: p.tax },
              { accountCode: PAYROLL_ACCOUNTS.salaryDue.code, accountName: PAYROLL_ACCOUNTS.salaryDue.name, debit: 0, credit: p.net },
            ] },
          },
        })
        await tx.payslip.update({ where: { id: slip.id }, data: { entryId: entry.id } })
      }
      const bankEntry = await tx.journalEntry.create({
        data: {
          orgId: s.orgId, entryDate, reference: `${reference}/BQ`,
          description: `Paie ${periodLabel(period)} — paiement des salaires (virement, ${slips.length} bénéficiaires)`,
          source: 'PAYROLL', sourceId: run.id, posted: true,
          lines: { create: [
            { accountCode: PAYROLL_ACCOUNTS.salaryDue.code, accountName: PAYROLL_ACCOUNTS.salaryDue.name, debit: totals.net, credit: 0 },
            { accountCode: PAYROLL_ACCOUNTS.bank.code, accountName: PAYROLL_ACCOUNTS.bank.name, debit: 0, credit: totals.net },
          ] },
        },
      })
      await tx.payRun.update({ where: { id: run.id }, data: { rulesJson: JSON.stringify({ rules, accounts: PAYROLL_ACCOUNTS, bankEntryId: bankEntry.id }) } })
      return run.id
    })

    await audit({
      orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
      action: 'PAYROLL_RUN_POSTED', resourceType: 'PayRun', resourceId: payRunId,
      summary: `Paie ${periodLabel(period)} clôturée — ${slips.length} bulletins · brut ${totals.gross.toLocaleString('fr-FR')} · net ${totals.net.toLocaleString('fr-FR')} XOF (journal PAIE)${sectorFindings.length ? ` · ${sectorFindings.length} constat(s) sectoriel(s) [${rules.sectorCode}]` : ''}`,
      meta: { period, reference, totals, pack: rules.packCode, packVersion: rules.packVersion, sectorCode: rules.sectorCode, sectorFindings },
    })

    return {
      item: { id: payRunId, reference, period, headcount: slips.length, ...totals, currency: 'XOF', countryPackCode: rules.packCode },
      journalAccounts: [PAYROLL_ACCOUNTS.employerSocial.code, PAYROLL_ACCOUNTS.social.code, PAYROLL_ACCOUNTS.taxWithheld.code, PAYROLL_ACCOUNTS.salaryDue.code, PAYROLL_ACCOUNTS.bank.code],
      sectorFindings,
    }
  })
}
