// YAHRIA BUSINESS OS V1 — 06_PAIE : bulletin de paie PDF par salarié
// GET /api/v1/finance/payroll/payslip/[id]/pdf
// Double garde RLS : payslip.orgId === session.orgId ET payRun.orgId === session.orgId (INV-001).
// Le bulletin est rendu avec les paramètres FIGÉS à la clôture (rulesJson du
// run) : il reflète exactement le calcul qui a produit l'écriture. Si le run
// est REVERSED, le bulletin porte le bandeau d'annulation + motif scellé.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/yahria/auth'
import { db } from '@/lib/db'
import { loadExportMeta } from '@/lib/yahria/ohada'
import { buildPayslipPdf } from '@/lib/yahria/payslip-pdf'
import { periodLabel } from '@/lib/yahria/payroll'
import { jparse } from '@/lib/yahria/core'

interface RunRulesJson {
  rules?: { socialLabel?: string; taxLabel?: string; scheduleLabel?: string }
  reversal?: { reason: string; reversedAt: string; reversedBy: string; evidenceRef?: string }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withAuth(req, 'finance.read', async (s) => {
    const slip = await db.payslip.findFirst({
      where: { id, orgId: s.orgId },
      include: { payRun: true },
    })
    if (!slip || slip.payRun.orgId !== s.orgId) {
      return NextResponse.json({ error: 'Bulletin introuvable (ou hors périmètre de votre organisation)' }, { status: 404 })
    }
    const run = slip.payRun
    const parsed = jparse<RunRulesJson>(run.rulesJson, {})
    const d = new Date(Date.UTC(Number(run.period.slice(0, 4)), Number(run.period.slice(5, 7)) - 1, 1))
    const meta = await loadExportMeta(s.orgId, d, d)

    const pdf = await buildPayslipPdf({
      slip: {
        employeeCode: slip.employeeCode, employeeName: slip.employeeName, position: slip.position,
        contractType: slip.contractType, accountCode: slip.accountCode,
        gross: slip.gross, cnssEmployee: slip.cnssEmployee, cnssEmployer: slip.cnssEmployer,
        tax: slip.tax, net: slip.net,
        lines: jparse(slip.linesJson, []),
      },
      run: {
        reference: run.reference, period: run.period, periodLabel: periodLabel(run.period),
        status: run.status, countryPackCode: run.countryPackCode, postedAt: run.postedAt.toISOString(),
        headcount: run.headcount,
      },
      org: {
        name: meta.orgName, legalName: meta.legalName, taxIdLabel: meta.taxIdLabel, taxId: meta.taxId,
        rccm: meta.rccm, countryCode: meta.countryCode, currencyCode: meta.currencyCode,
      },
      rules: {
        socialLabel: parsed.rules?.socialLabel ?? 'Sécurité sociale',
        taxLabel: parsed.rules?.taxLabel ?? 'Impôt sur salaires',
        scheduleLabel: parsed.rules?.scheduleLabel ?? 'Barème national',
      },
      reversal: run.status === 'REVERSED' ? parsed.reversal ?? null : null,
    })

    const filename = `bulletin-paie_${slip.employeeCode.replace(/\s+/g, '-')}_${run.period}${run.status === 'REVERSED' ? '_ANNULE' : ''}.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  })
}
