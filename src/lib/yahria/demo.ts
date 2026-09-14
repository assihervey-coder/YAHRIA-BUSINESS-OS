// YAHRIA BUSINESS OS V1 — Mode démo 2FA (SEC-003 · ergonomie de démonstration)
// ─────────────────────────────────────────────────────────────────────────────
// La 2FA TOTP reste RÉELLE (secret, QR, vérification, codes de récupération).
// Cette couche ne change AUCUNE garantie cryptographique : elle pilote UNIQUEMENT
// l'assistance à la saisie du code dans une environnement de DÉMONSTRATION, où le
// présentateur n'a pas d'application authentificatrice sous la main.
//
// YAHRIA_DEMO_2FA :
//  · 'assist' (défaut) — 2FA obligatoire inchangée, mais le code TOTP courant est
//    affiché + auto-rempli dans l'UI (étape 2 de connexion et enrôlement). Le flux
//    complet est démontré sans app authenticator.
//  · 'off'    — 2FA désactivée : connexion par mot de passe seul, mur MFA jamais
//    actif (démo ultra-fluide). Les comptes déjà enrôlés se connectent sans défi.
//  · 'strict' — production : aucune assistance, comportement nominal.

export type Demo2faMode = 'off' | 'assist' | 'strict'

function parseMode(raw: string | undefined): Demo2faMode {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'off' || v === '0' || v === 'false' || v === 'disabled') return 'off'
  if (v === 'strict' || v === 'production' || v === 'prod') return 'strict'
  return 'assist'
}

export const DEMO_2FA: Demo2faMode = parseMode(process.env.YAHRIA_DEMO_2FA)

/** Assistance démo active : le code TOTP courant peut être affiché dans l'UI. */
export function isDemoAssist(): boolean {
  return DEMO_2FA === 'assist'
}

/** 2FA entièrement désactivée (mode démo fluide). */
export function isDemo2faOff(): boolean {
  return DEMO_2FA === 'off'
}

/** Secondes restantes avant rotation du code TOTP courant (pas de 30 s). */
export function totpRemainingSeconds(unixSeconds: number = Math.floor(Date.now() / 1000)): number {
  return 30 - (unixSeconds % 30)
}
