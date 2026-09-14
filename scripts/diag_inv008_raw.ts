// DIAGNOSTIC INV-008 étape 2 — métadonnées brutes + essai de variantes de signature
import { createHmac } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const K_ENV = process.env.EVIDENCE_SIGNING_KEY ?? ''
const K_FB = 'yahria-dev-signing-key-DO-NOT-USE-IN-PROD'

function hmac(key: string, msg: string): string {
  return createHmac('sha256', key).update(msg).digest('hex').toUpperCase()
}

async function main() {
  const prisma = new PrismaClient()
  const rows = await prisma.evidence.findMany({ orderBy: [{ orgId: 'asc' }, { seq: 'asc' }] })
  const org = rows[0]?.orgId
  console.log('--- RAW ROWS (org:', org, ') ---')
  for (const r of rows.filter((x) => x.orgId === org)) {
    console.log(`seq=${r.seq} ref=${r.ref}`)
    console.log(`  algo=${JSON.stringify(r.algo)}`)
    console.log(`  signature(${r.signature?.length})=${r.signature}`)
    console.log(`  prevHash(${r.prevHash?.length})=${JSON.stringify(r.prevHash)}`)
    console.log(`  hash=${r.hash}`)
    console.log(`  createdAt=${r.createdAt?.toISOString()}`)
  }

  // Variantes de signature pour seq=1 (prevHash='' prevSig='')
  const first = rows.filter((x) => x.orgId === org).sort((a, b) => a.seq - b.seq)[0]
  console.log('\n--- VARIANTS for first row ---')
  const variants: [string, string][] = [
    ['current: ref|hash|prevHash|prevSig', `${first.ref}|${first.hash}|${first.prevHash}|`],
    ['no pipe end: ref|hash|prevHash|prevSig (undefined)', `${first.ref}|${first.hash}|${first.prevHash}|undefined`],
    ['ref|hash', `${first.ref}|${first.hash}`],
    ['hash only', `${first.hash}`],
    ['payload|ref (hmac over payload)', `${first.payloadJson}|${first.ref}`],
  ]
  for (const [name, msg] of variants) {
    console.log(`${name}`)
    console.log(`   envKey → ${hmac(K_ENV, msg)}`)
    console.log(`   fbKey  → ${hmac(K_FB, msg)}`)
  }
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
