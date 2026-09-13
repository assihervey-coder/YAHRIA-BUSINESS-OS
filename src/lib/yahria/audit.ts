// YAHRIA BUSINESS OS V1 — Audit (INV-AUDIT-*) & Evidence (INV-EVD-*) engines
import { db } from '@/lib/db'
import { ref, simpleHash, traceId } from './core'

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
  return db.auditRecord.create({
    data: {
      orgId: entry.orgId,
      traceId: entry.traceId ?? traceId(),
      actorType: entry.actorType,
      actorId: entry.actorId ?? entry.actorType.toLowerCase(),
      actorName: entry.actorName ?? (entry.actorType === 'HUMAN' ? 'Awa Koné (DG)' : entry.actorType === 'AGENT' ? 'Agent' : 'Système'),
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
}): Promise<{ id: string; ref: string; hash: string }> {
  const eRef = ref('EVD')
  const payloadJson = JSON.stringify(input.payload)
  const hash = simpleHash(payloadJson + eRef)
  const ev = await db.evidence.create({
    data: {
      orgId: input.orgId,
      ref: eRef,
      kind: input.kind,
      title: input.title,
      payloadJson,
      hash,
      provenanceJson: JSON.stringify({
        recordedAt: new Date().toISOString(),
        engine: 'YAHRIA Evidence Engine v1',
        ...input.provenance,
      }),
      relatedId: input.relatedId,
    },
  })
  return { id: ev.id, ref: ev.ref, hash: ev.hash }
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
