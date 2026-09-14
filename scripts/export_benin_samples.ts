// YAHRIA — Échantillons d'export SYSCOHADA pour l'org Bénin (IFU) → download/
import { dbUnscoped, runWithRls } from '../src/lib/db'
import { loadExportMeta, loadEntries, computeBalance, computeLettrage, computeGrandLivre, computeJournaux } from '../src/lib/yahria/ohada'
import { buildBalanceXlsx, buildGrandLivreXlsx, buildJournauxXlsx } from '../src/lib/yahria/ohada-xlsx'
import { buildBalancePdf, buildGrandLivrePdf, buildJournauxPdf } from '../src/lib/yahria/ohada-pdf'
import fs from 'node:fs'

async function main() {
  const org = await dbUnscoped.organization.findFirst({ where: { countryCode: 'BJ' } })
  const from = new Date(Date.UTC(2026, 0, 1))
  const to = new Date(Date.UTC(2026, 11, 31, 23, 59, 59))
  const ctx = { tenantId: org!.tenantId, orgId: org!.id, userId: 'sample', role: 'OWNER' }
  const meta = await runWithRls(ctx, () => loadExportMeta(org!.id, from, to))
  console.log(`meta BJ: ${meta.legalName} — ${meta.taxIdLabel} ${meta.taxId} — RCCM ${meta.rccm}`)
  if (meta.taxIdLabel !== 'IFU') throw new Error('Libellé fiscal BJ attendu : IFU')
  const entries = await runWithRls(ctx, () => loadEntries(org!.id, from, to))
  const lettrage = await computeLettrage(org!.id)
  const balance = computeBalance(entries)
  const gl = computeGrandLivre([], entries, lettrage)
  const jr = computeJournaux(entries)
  const dir = 'download/syscohada_export_samples_bj'
  fs.mkdirSync(dir, { recursive: true })
  const name = 'SYSCOHADA_Benin_Golfe-Trading_2026'
  fs.writeFileSync(`${dir}/balance-generale_${name}.xlsx`, await buildBalanceXlsx(balance, meta))
  fs.writeFileSync(`${dir}/balance-generale_${name}.pdf`, await buildBalancePdf(balance, meta))
  fs.writeFileSync(`${dir}/grand-livre-lettre_${name}.xlsx`, await buildGrandLivreXlsx(gl, meta))
  fs.writeFileSync(`${dir}/grand-livre-lettre_${name}.pdf`, await buildGrandLivrePdf(gl, meta))
  fs.writeFileSync(`${dir}/journaux_${name}.xlsx`, await buildJournauxXlsx(jr, meta))
  fs.writeFileSync(`${dir}/journaux_${name}.pdf`, await buildJournauxPdf(jr, meta))
  console.log(`6 échantillons BJ écrits dans ${dir}/ (entries=${entries.length}, lettrage=${lettrage.size})`)
}
main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1) })
