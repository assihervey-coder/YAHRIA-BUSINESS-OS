// Clé de signature MFA dérivée — séparée de totp.ts pour éviter les imports
// circulaires et garder la clé Evidence comme unique racine de confiance.
export const EVIDENCE_SIGNING_KEY: string =
  process.env.EVIDENCE_SIGNING_KEY ?? 'dev-only-insecure-fallback-key-change-me'
