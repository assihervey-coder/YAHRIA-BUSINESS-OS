// DIAGNOSTIC INV-008 — pourquoi 0/7 signatures valides ?
// Recalcule hash + signature de chaque Evidence avec les deux clés candidates
// et compare avec ce qui est stocké en base.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const DB_KEY = process.env.EVIDENCE_SIGNING_KEY ?? ''
const FALLBACK = 'yahria-dev-signing-key-DO-NOT-USE-IN-PROD'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex').toUpperCase()
}
function hmac(key: string, input: string): string {
  return createHmac('sha256', key).update(input).digest('hex').toUpperCase()
}

async function main() {
  const prisma = new PrismaClient()
  const rows = await prisma.evidence.findMany({ orderBy: { seq: 'asc' } })
  console.log(`Total evidence rows: ${rows.length}`)
  const byOrg = new Map<string, number>()
  for (const r of rows) byOrg.set(r.orgId, (byOrg.get(r.orgId) ?? 0) + 1)
  for (const [org, n] of byOrg) console.log(`  org=${org} → ${n} rows`)

  // Group by org, verify chain per org like verifyEvidenceChain does
  for (const [orgId, _] of byOrg) {
    console.log(`\n=== ORG ${orgId} ===`)
    const orgRows = rows.filter((r) => r.orgId === orgId).sort((a, b) => a.seq - b.seq)
    let prevSig = ''
    let prevHash = ''
    let hasPrev = false
    for (const r of orgRows) {
      const hashOk = sha256(`${r.payloadJson}|${r.ref}`) === r.hash.toUpperCase()
      const expectedEnv = hmac(DB_KEY, `${r.ref}|${r.hash.toUpperCase()}|${r.prevHash}|${prevSig}`)
      const expectedFb = hmac(FALLBACK, `${r.ref}|${r.hash.toUpperCase()}|${r.prevHash}|${prevSig}`)
      const sigEnv = safeEq(expectedEnv, r.signature)
      const sigFb = safeEq(expectedFb, r.signature)
      const linkOk = !hasPrev || r.prevHash === prevHash
      console.log(
        `seq=${r.seq} ref=${r.ref} kind=${r.kind} | hashOk=${hashOk ? 'OK' : 'KO'} | sigWithEnvKey=${sigEnv ? 'OK' : 'ko'} sigWithFallback=${sigFb ? 'OK' : 'ko'} | link=${linkOk ? 'OK' : 'KO'}`
      )
      if (!hashOk) {
        const recomputed = sha256(`${r.payloadJson}|${r.ref}`)
        console.log(`    hash stored=${r.hash}`)
        console.log(`    hash recomp=${recomputed}`)
      }
      prevSig = r.signature
      prevHash = r.hash
      hasPrev = true
    }
  }
  await prisma.$disconnect()
}

function safeEq(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b.trim().toUpperCase(), 'hex'))
  } catch {
    return false
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
