// YAHRIA BUSINESS OS V1 — Hachage de mots de passe (module isolé pour éviter
// tout import circulaire entre auth ↔ seed).
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pw, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split(':')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const candidate = scryptSync(pw, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
