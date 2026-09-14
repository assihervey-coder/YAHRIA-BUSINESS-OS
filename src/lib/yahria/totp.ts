// YAHRIA BUSINESS OS V1 — TOTP RFC 6238 (2FA, SEC-003)
// Implémentation autonome sur node:crypto — aucune dépendance externe.
//  · Secret 160 bits encodé Base32 (RFC 4648)
//  · HMAC-SHA1, pas de 30 s, 6 chiffres, fenêtre de tolérance ±1
//  · Codes de récupération à usage unique (8 codes, hashés SHA-256)
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c)
    if (idx === -1) throw new Error('Base32 invalide')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** Génère un secret TOTP de 160 bits (20 octets) encodé Base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** Calcule le code TOTP à un instant donné (défaut : maintenant). */
export function totpAt(secret: string, unixSeconds: number = Math.floor(Date.now() / 1000)): string {
  const counter = Math.floor(unixSeconds / 30)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

/** Vérifie un code avec fenêtre de tolérance ±1 pas (±30 s d'horloge). */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const now = Math.floor(Date.now() / 1000)
  for (let drift = -window; drift <= window; drift++) {
    const expected = totpAt(secret, now + drift * 30)
    const a = Buffer.from(expected)
    const b = Buffer.from(clean)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

/** URL otpauth:// pour apps authentificatrices (Google Authenticator, Aegis…). */
export function otpauthUrl(secret: string, email: string, issuer = 'YAHRIA Business OS'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' })
  return `otpauth://totp/${label}?${params.toString()}`
}

// ── Codes de récupération à usage unique ────────────────────────────────────
export interface RecoveryCode {
  hash: string
  usedAt: string | null
}

export function generateRecoveryCodes(count = 8): { plain: string[]; hashed: RecoveryCode[] } {
  const plain: string[] = []
  const hashed: RecoveryCode[] = []
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString('hex').toUpperCase() // 10 hex → XXXX-XXXX
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`
    plain.push(code)
    hashed.push({ hash: recoveryHash(code), usedAt: null })
  }
  return { plain, hashed }
}

export function recoveryHash(code: string): string {
  return createHash('sha256').update(code.toUpperCase().replace(/\s/g, '')).digest('hex')
}

/** Consomme un code de récupération non utilisé. Retourne true si validé. */
export function consumeRecoveryCode(codes: RecoveryCode[], input: string): boolean {
  const h = recoveryHash(input)
  const target = codes.find((c) => !c.usedAt && c.hash === h)
  if (!target) return false
  target.usedAt = new Date().toISOString()
  return true
}

// ── Défi MFA signé (étape 2 de la connexion) ─────────────────────────────────
// HMAC(EVIDENCE_SIGNING_KEY, 'mfa-challenge') : clé dédiée dérivée, jamais la
// clé Evidence elle-même. Single-use via registre mémoire (instance unique V1).
import { EVIDENCE_SIGNING_KEY } from './mfa-key'

const usedChallenges = new Map<string, number>()
const CHALLENGE_TTL_MS = 5 * 60 * 1000

function mfaKey(): string {
  return createHmac('sha256', EVIDENCE_SIGNING_KEY).update('mfa-challenge-v1').digest('hex')
}

/** Émet un défi signé {userId, nonce, exp} — TTL 5 min, usage unique. */
export function issueMfaChallenge(userId: string): { challenge: string; expiresIn: number } {
  const payload = Buffer.from(
    JSON.stringify({ userId, nonce: randomBytes(12).toString('hex'), exp: Date.now() + CHALLENGE_TTL_MS })
  ).toString('base64url')
  const sig = createHmac('sha256', mfaKey()).update(payload).digest('base64url')
  const challenge = `${payload}.${sig}`
  cleanupChallenges()
  return { challenge, expiresIn: Math.floor(CHALLENGE_TTL_MS / 1000) }
}

/** Vérifie un défi (signature + expiration + non-consommé). Retourne l'userId. */
export function verifyMfaChallenge(challenge: string): string | null {
  const [payload, sig] = String(challenge).split('.')
  if (!payload || !sig) return null
  const expected = createHmac('sha256', mfaKey()).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { userId: string; nonce: string; exp: number }
    if (data.exp < Date.now()) return null
    if (usedChallenges.has(data.nonce)) return null
    usedChallenges.set(data.nonce, data.exp)
    cleanupChallenges()
    return data.userId
  } catch {
    return null
  }
}

function cleanupChallenges() {
  const now = Date.now()
  for (const [nonce, exp] of usedChallenges) if (exp < now) usedChallenges.delete(nonce)
}
