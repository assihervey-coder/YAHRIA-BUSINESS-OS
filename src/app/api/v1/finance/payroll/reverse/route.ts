// YAHRIA BUSINESS OS V1 — 06_PAIE : contre-passation GUIDÉE d'une clôture
// POST /api/v1/finance/payroll/reverse  { payRunId, reason, confirmRef }
// La clôture est immuable (INV-PAIE) : corriger une paie = contre-passation.
// L'extourne est le MIROIR EXACT des écritures d'origine (constatation par
// salarié + paiement agrégé), datée du jour, postée au journal PAIE. Garde
// guidée : motif ≥ 10 caractères, re-saisie exacte de la référence du run
// (anti-clic accidentel), statut POSTED exigé (double contre-passation
// impossible). L'opération est scellée dans la chaîne Evidence (INV-008) et
// auditée (PAYROLL_REVERSAL_POSTED). L'orgId provient EXCLUSIVEMENT de la
// session (INV-001) — jamais du corps.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/yahria/auth'
import { db, dbUnscoped } from '@/lib/db'
import { audit, recordEvidence } from '@/lib/yahria/audit'
import {
  reversalLinesOf, reversalPaymentLines, linesBalanced, periodLabel,
  PAYROLL_ACCOUNTS,
} from '@/lib/yahria/payroll'

export async function POST(req: NextRequest) {
  return withAuth(req, 'finance.write', async (s) => {
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const payRunId = String((body as { payRunId?: string }).payRunId ?? '').trim()
    const reason = String((body as { reason?: string }).reason ?? '').trim()
    const confirmRef = String((body as { confirmRef?: string }).confirmRef ?? '').trim()

    const run = await db.payRun.findFirst({
      where: { id: payRunId, orgId: s.orgId },
      include: { payslips: { orderBy: { employeeCode: 'asc' } } },
    })
    if (!run) return NextResponse.json({ error: 'Clôture de paie introuvable (ou hors périmètre de votre organisation)' }, { status: 404 })
    if (run.status !== 'POSTED') {
      return NextResponse.json({ error: `INV-PAIE-REV : la paie ${periodLabel(run.period)} n'est plus au statut POSTED (${run.status}) — contre-passation déjà enregistrée, aucune seconde extourne possible` }, { status: 409 })
    }
    if (reason.length < 10) {
      return NextResponse.json({ error: 'Motif obligatoire (10 caractères minimum) — la contre-passation est scellée dans la chaîne d' + "'" + 'audit' }, { status: 400 })
    }
    if (confirmRef !== run.reference) {
      return NextResponse.json({ error: `Confirmation refusée : retapez exactement la référence ${run.reference} pour valider l'extourne` }, { status: 400 })
    }

    // Pré-calcul du miroir (hors transaction) + gardes d'équilibre
    const now = new Date()
    const refBase = `PAIE-REV-${run.period}-${run.orgId.slice(0, 8).toUpperCase()}`
    const revSlips = run.payslips.map((p, i) => ({
      slipId: p.id, employeeName: p.employeeName,
      lines: reversalLinesOf({
        gross: p.gross, cnssEmployee: p.cnssEmployee, cnssEmployer: p.cnssEmployer,
        tax: p.tax, net: p.net, accountCode: p.accountCode,
      }),
      reference: `${refBase}/P${i + 1}`,
      description: `Contre-passation ${run.reference} — ${p.employeeName} (extourne constatation)`,
    }))
    for (const rs of revSlips) {
      if (!linesBalanced(rs.lines)) {
        return NextResponse.json({ error: `INV-ACC-001 : extourne déséquilibrée pour ${rs.employeeName} — contre-passation annulée` }, { status: 500 })
      }
    }
    const bankLines = reversalPaymentLines(run.netTotal)
    if (!linesBalanced(bankLines)) {
      return NextResponse.json({ error: 'INV-ACC-001 : extourne du paiement déséquilibrée — contre-passation annulée' }, { status: 500 })
    }
    const totalDebit =
      revSlips.reduce((a, rs) => a + rs.lines.reduce((x, l) => x + l.debit, 0), 0) +
      bankLines.reduce((x, l) => x + l.debit, 0)

    // Transaction SYSTÈME (périmètre orgId issu de la session) — append-only (INV-007)
    const entryIds = await dbUnscoped.$transaction(async (tx) => {
      const ids: string[] = []
      for (const [i, rs] of revSlips.entries()) {
        const slip = run.payslips[i]
        const entry = await tx.journalEntry.create({
          data: {
            orgId: s.orgId, entryDate: now, reference: rs.reference, description: rs.description,
            source: 'PAYROLL_REVERSAL', sourceId: slip.id, posted: true,
            lines: { create: rs.lines.map((l) => ({ accountCode: l.accountCode, accountName: l.accountName, debit: l.debit, credit: l.credit })) },
          },
        })
        ids.push(entry.id)
      }
      const bankEntry = await tx.journalEntry.create({
        data: {
          orgId: s.orgId, entryDate: now, reference: `${refBase}/BQ`,
          description: `Contre-passation ${run.reference} — extourne du paiement des salaires (virement)`,
          source: 'PAYROLL_REVERSAL', sourceId: run.id, posted: true,
          lines: { create: bankLines.map((l) => ({ accountCode: l.accountCode, accountName: l.accountName, debit: l.debit, credit: l.credit })) },
        },
      })
      ids.push(bankEntry.id)

      await tx.payRun.update({
        where: { id: run.id },
        data: {
          status: 'REVERSED',
          rulesJson: JSON.stringify({
            ...(JSON.parse(run.rulesJson) as Record<string, unknown>),
            reversal: { reason, reversedAt: now.toISOString(), reversedBy: s.name, reversedById: s.userId, entryIds: ids },
          }),
        },
      })
      return ids
    })

    const ev = await recordEvidence({
      orgId: s.orgId, kind: 'ACCOUNTING',
      title: `Contre-passation ${run.reference}`,
      payload: {
        payRunId: run.id, reference: run.reference, period: run.period, status: 'REVERSED',
        headcount: run.payslips.length, grossTotal: run.grossTotal, netTotal: run.netTotal,
        reversalTotal: totalDebit, entryIds, reason,
        accounts: [PAYROLL_ACCOUNTS.social.code, PAYROLL_ACCOUNTS.taxWithheld.code, PAYROLL_ACCOUNTS.salaryDue.code, PAYROLL_ACCOUNTS.employerSocial.code, PAYROLL_ACCOUNTS.bank.code],
      },
      provenance: { feature: 'payroll-guided-reversal', actor: s.userId },
      relatedId: run.id,
    })

    await audit({
      orgId: s.orgId, actorType: 'HUMAN', actorId: s.userId, actorName: s.name,
      action: 'PAYROLL_REVERSAL_POSTED', resourceType: 'PayRun', resourceId: run.id,
      summary: `Contre-passation guidée de ${run.reference} — ${run.payslips.length} bulletin(s) annulé(s) · extourne D=C=${totalDebit.toLocaleString('fr-FR')} XOF au journal PAIE · motif : ${reason}`,
      meta: { payRunId: run.id, reference: run.reference, period: run.period, entryIds, reversalTotal: totalDebit, reason, evidenceRef: ev.ref },
    })

    return {
      item: {
        payRunId: run.id, reference: run.reference, period: run.period, status: 'REVERSED',
        headcount: run.payslips.length, reversalTotal: totalDebit, currency: 'XOF',
        entryIds, evidence: { ref: ev.ref, hash: ev.hash, seq: ev.seq },
      },
      accounts: [PAYROLL_ACCOUNTS.social.code, PAYROLL_ACCOUNTS.taxWithheld.code, PAYROLL_ACCOUNTS.salaryDue.code, PAYROLL_ACCOUNTS.employerSocial.code, PAYROLL_ACCOUNTS.bank.code],
    }
  })
}
