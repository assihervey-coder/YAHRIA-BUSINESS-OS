import { runConstructionProofs } from '../src/lib/yahria/invariants'
import { dbUnscoped } from '../src/lib/db'
async function main() {
  const org = await dbUnscoped.organization.findFirst({ where: { countryCode: 'CI' } })
  const { proofs } = await runConstructionProofs(org!.id)
  for (const p of proofs) {
    console.log(p.id, p.status, '—', p.proof.slice(0, 90))
    for (const c of p.checks.filter((c) => !c.ok)) console.log('   ✗', c.label, '→', c.detail.slice(0, 100))
  }
}
main().then(() => process.exit(0))
