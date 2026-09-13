import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPrimaryOrgId } from '@/lib/yahria/seed'

export async function GET() {
  const orgId = await getPrimaryOrgId()
  const [accounts, entries] = await Promise.all([
    db.account.findMany({ where: { orgId }, orderBy: { code: 'asc' } }),
    db.journalEntry.findMany({ where: { orgId }, orderBy: { entryDate: 'desc' }, take: 80, include: { lines: true } }),
  ])

  // Balance verification (INV-ACC-001) computed live
  let totalDebit = 0
  let totalCredit = 0
  for (const e of entries) {
    for (const l of e.lines) {
      totalDebit += l.debit
      totalCredit += l.credit
    }
  }
  const balanced = Math.abs(totalDebit - totalCredit) < 1

  // Balances by account (grand livre)
  const byAccount: Record<string, { code: string; name: string; debit: number; credit: number }> = {}
  for (const e of entries) {
    for (const l of e.lines) {
      if (!byAccount[l.accountCode]) byAccount[l.accountCode] = { code: l.accountCode, name: l.accountName, debit: 0, credit: 0 }
      byAccount[l.accountCode].debit += l.debit
      byAccount[l.accountCode].credit += l.credit
    }
  }

  return NextResponse.json({
    chartOfAccounts: accounts,
    entries: entries.map((e) => ({ ...e, lines: e.lines })),
    ledger: Object.values(byAccount).sort((a, b) => a.code.localeCompare(b.code)),
    integrity: { totalDebit, totalCredit, balanced },
  })
}
