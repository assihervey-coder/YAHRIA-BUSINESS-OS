// YAHRIA BUSINESS OS V1 — Shared types & money helpers
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type PolicyDecision = 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY'

export interface TimelineStep {
  ts: string
  state: string
  note: string
}

export interface LoopStep {
  step: string
  state: 'OK' | 'WARN' | 'BLOCK' | 'WAIT' | 'INFO'
  detail: string
}

export function xof(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' FCFA'
}

export function num(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n))
}

export function ref(prefix: string): string {
  const d = new Date()
  const stamp =
    d.getFullYear().toString().slice(2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `${prefix}-${stamp}-${rand}`
}

export function traceId(): string {
  return 'trc_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
}

export function simpleHash(input: string): string {
  // FNV-1a 32-bit, hex — evidence fingerprint (demo grade)
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8).toUpperCase()
}

export function riskLevelOf(score: number): RiskLevel {
  if (score >= 75) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 25) return 'MEDIUM'
  return 'LOW'
}

export function jparse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
