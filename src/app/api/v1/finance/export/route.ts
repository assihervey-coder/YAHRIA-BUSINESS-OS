// YAHRIA BUSINESS OS V1 — Export SYSCOHADA (GET /api/v1/finance/export)
// Query : type=balance|grandlivre|journal · format=xlsx|pdf · from · to (ISO)
// Périmètre RLS : uniquement les écritures de l'organisation courante (INV-001).
// Réponse : fichier binaire (Content-Disposition attachment).
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/yahria/auth'
import { db } from '@/lib/db'
import {
  loadEntries,
  loadExportMeta,
  computeBalance,
  computeGrandLivre,
  computeJournaux,
  computeLettrage,
} from '@/lib/yahria/ohada'
import { buildBalanceXlsx, buildGrandLivreXlsx, buildJournauxXlsx } from '@/lib/yahria/ohada-xlsx'
import { buildBalancePdf, buildGrandLivrePdf, buildJournauxPdf } from '@/lib/yahria/ohada-pdf'

export async function GET(req: NextRequest) {
  return withAuth(req, 'finance.read', async (s) => {
    const sp = req.nextUrl.searchParams
    const type = sp.get('type') ?? 'balance'
    const format = (sp.get('format') ?? 'pdf').toLowerCase()
    const year = new Date().getFullYear()
    const from = sp.get('from') ? new Date(`${sp.get('from')}T00:00:00.000Z`) : new Date(Date.UTC(year, 0, 1))
    const to = sp.get('to') ? new Date(`${sp.get('to')}T23:59:59.999Z`) : new Date(Date.UTC(year, 11, 31, 23, 59, 59))
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error('Dates invalides (format attendu : YYYY-MM-DD)')
    if (from > to) throw new Error('La date de début doit précéder la date de fin')
    if (!['balance', 'grandlivre', 'journal'].includes(type)) throw new Error(`Type inconnu : ${type}`)
    if (!['xlsx', 'pdf'].includes(format)) throw new Error(`Format inconnu : ${format}`)

    const meta = await loadExportMeta(s.orgId, from, to)
    const entries = await loadEntries(s.orgId, from, to)

    let body: Buffer
    let filename: string
    const typeLabel: Record<string, string> = { balance: 'balance-generale', grandlivre: 'grand-livre', journal: 'journaux' }

    if (type === 'balance') {
      const rows = computeBalance(entries)
      filename = `SYSCOHADA_balance-generale_${meta.orgName.replace(/\s+/g, '-')}_${sp.get('from') ?? 'exercice'}.${format}`
      body = format === 'xlsx' ? await buildBalanceXlsx(rows, meta) : await buildBalancePdf(rows, meta)
    } else if (type === 'grandlivre') {
      const prior = await db.journalEntry.findMany({
        where: { orgId: s.orgId, posted: true, entryDate: { lt: from } },
        orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
        include: { lines: true },
      })
      const lettrage = await computeLettrage(s.orgId)
      const accounts = computeGrandLivre(prior as never, entries as never, lettrage)
      filename = `SYSCOHADA_grand-livre_${meta.orgName.replace(/\s+/g, '-')}_${sp.get('from') ?? 'exercice'}.${format}`
      body = format === 'xlsx' ? await buildGrandLivreXlsx(accounts, meta) : await buildGrandLivrePdf(accounts, meta)
    } else {
      const journals = computeJournaux(entries)
      filename = `SYSCOHADA_journaux_${meta.orgName.replace(/\s+/g, '-')}_${sp.get('from') ?? 'exercice'}.${format}`
      body = format === 'xlsx' ? await buildJournauxXlsx(journals, meta) : await buildJournauxPdf(journals, meta)
    }

    const res = new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type':
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
    return res
  })
}
