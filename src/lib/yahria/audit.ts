// YAHRIA BUSINESS OS V1 — Audit (INV-AUDIT-*) & Evidence signée (INV-EVD-*)
// Chaque Evidence porte : hash SHA-256 du payload + signature HMAC-SHA256 chaînée
// à la preuve précédente de l'organisation (ledger de preuves infalsifiable :
// modifier une preuve casse la signature de toutes les suivantes).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { dbUnscoped } from '@/lib/db'
import { ref, traceId, riskLevelOf, type PolicyDecision } from './core'

const SIGNING_KEY = process.env.EVIDENCE_SIGNING_KEY || 'yahria-dev-signing-key-DO-NOT-USE-IN-PROD'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex').toUpperCase()
}

function hmac(input: string): string {
  return createHmac('sha256', SIGNING_KEY).update(input).digest('hex').toUpperCase()
}

export function evidenceHash(payloadJson: string, eRef: string): string {
  return sha256(`${payloadJson}|${eRef}`)
}

export function evidenceSignature(eRef: string, hash: string, prevHash: string, prevSignature: string): string {
  return hmac(`${eRef}|${hash}|${prevHash}|${prevSignature}`)
}

/** Recalcule hash + signature d'une ligne et compare (constant-time). */
export function verifyEvidenceLine(line: { ref: string; payloadJson: string; hash: string; signature: string; prevHash: string }, prevSignature: string): { hashOk: boolean; signatureOk: boolean } {
  const hashOk = evidenceHash(line.payloadJson, line.ref) === line.hash.toUpperCase()
  const expected = evidenceSignature(line.ref, line.hash.toUpperCase(), line.prevHash, prevSignature)
  let signatureOk = false
  try {
    signatureOk = timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(line.signature, 'hex'))
  } catch {
    signatureOk = false
  }
  return { hashOk, signatureOk }
}

export async function audit(entry: {
  orgId: string
  actorType: 'HUMAN' | 'AGENT' | 'SYSTEM'
  actorId?: string
  actorName?: string
  action: string
  resourceType: string
  resourceId?: string
  summary: string
  meta?: Record<string, unknown>
  traceId?: string
}) {
  return dbUnscoped.auditRecord.create({
    data: {
      orgId: entry.orgId,
      traceId: entry.traceId ?? traceId(),
      actorType: entry.actorType,
      actorId: entry.actorId ?? entry.actorType.toLowerCase(),
      actorName: entry.actorName ?? (entry.actorType === 'HUMAN' ? 'Utilisateur' : entry.actorType === 'AGENT' ? 'Agent' : 'Système'),
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      summary: entry.summary,
      metaJson: JSON.stringify(entry.meta ?? {}),
    },
  })
}

export async function recordEvidence(input: {
  orgId: string
  kind: 'PAYMENT' | 'AGENT_DECISION' | 'AI_ANSWER' | 'POLICY' | 'ACCOUNTING' | 'APPROVAL'
  title: string
  payload: Record<string, unknown>
  provenance?: Record<string, unknown>
  relatedId?: string
}): Promise<{ id: string; ref: string; hash: string; signature: string; seq: number }> {
  const eRef = ref('EVD')
  const payloadJson = JSON.stringify(input.payload)
  const hash = evidenceHash(payloadJson, eRef)

  // Chaîne : dernière preuve de CETTE organisation (les chaînes ne se mélangent jamais)
  const prev = await dbUnscoped.evidence.findFirst({
    where: { orgId: input.orgId },
    orderBy: { seq: 'desc' },
    select: { hash: true, signature: true, seq: true },
  })
  const prevHash = prev?.hash ?? ''
  const prevSignature = prev?.signature ?? ''
  const signature = evidenceSignature(eRef, hash, prevHash, prevSignature)

  const ev = await dbUnscoped.evidence.create({
    data: {
      orgId: input.orgId,
      ref: eRef,
      kind: input.kind,
      title: input.title,
      payloadJson,
      hash,
      algo: 'SHA-256 + HMAC-SHA256',
      signature,
      prevHash,
      seq: (prev?.seq ?? 0) + 1,
      provenanceJson: JSON.stringify({
        recordedAt: new Date().toISOString(),
        engine: 'YAHRIA Evidence Engine v2 (signed chain)',
        ...input.provenance,
      }),
      relatedId: input.relatedId,
    },
  })
  return { id: ev.id, ref: ev.ref, hash: ev.hash, signature: ev.signature, seq: ev.seq }
}

export interface ChainReport {
  orgId: string
  total: number
  valid: number
  invalid: number
  chainIntact: boolean
  brokenAtSeq: number | null
  algo: string
  brokenRefs: string[]
  checkedAt: string
}

/** Vérifie l'intégrité complète de la chaîne de preuves d'une organisation. */
export async function verifyEvidenceChain(orgId: string): Promise<ChainReport> {
  const rows = await dbUnscoped.evidence.findMany({
    where: { orgId },
    orderBy: { seq: 'asc' },
    select: { ref: true, payloadJson: true, hash: true, signature: true, prevHash: true, seq: true },
  })

  const brokenRefs: string[] = []
  let prevSig = ''
  let brokenAt: number | null = null
  let valid = 0
  let hasPrev = false
  let prevHash = ''

  for (const r of rows) {
    const { hashOk, signatureOk } = verifyEvidenceLine(r, prevSig)
    const linkOk = !hasPrev || r.prevHash === prevHash
    if (hashOk && signatureOk && linkOk) {
      valid++
    } else {
      brokenRefs.push(r.ref)
      if (brokenAt === null) brokenAt = r.seq
    }
    prevSig = r.signature
    prevHash = r.hash
    hasPrev = true
  }

  return {
    orgId,
    total: rows.length,
    valid,
    invalid: rows.length - valid,
    chainIntact: brokenRefs.length === 0,
    brokenAtSeq: brokenAt,
    algo: 'SHA-256 + HMAC-SHA256 (chaîne)',
    brokenRefs,
    checkedAt: new Date().toISOString(),
  }
}

export function pushTimeline(timeline: string, state: string, note: string): string {
  let arr: { ts: string; state: string; note: string }[] = []
  try {
    arr = JSON.parse(timeline || '[]')
  } catch {
    arr = []
  }
  arr.push({ ts: new Date().toISOString(), state, note })
  return JSON.stringify(arr)
}

// re-export pour compat avec les imports existants du module core
export { riskLevelOf }
export type { PolicyDecision }
