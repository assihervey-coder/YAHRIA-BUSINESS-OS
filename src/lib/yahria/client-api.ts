'use client'

// YAHRIA BUSINESS OS V1 — Couche client API (robustesse PAR CONSTRUCTION)
//
// Avant : chaque vue faisait fetch().then(r => r.json()) sans vérifier le statut.
// Une réponse 401 (session expirée/révoquée) ou 403 (MFA_ENROLLMENT_REQUIRED)
// était donc rendue comme des données → TypeError en cascade (ex. cockpit.tsx
// « Cannot read properties of undefined (reading 'treasury') »).
//
// Désormais : TOUTE lecture frontend passe par apiJson() qui garantit que :
//  · le corps retourné correspond à une réponse 2xx (sinon → ApiFail typée)
//  · un 401 diffuse l'événement global yahria:session-expired — le shell
//    redirige vers /login (le composant n'a rien à faire)
//  · les erreurs restent des objets ApiFail (status + code contractuel),
//    jamais un corps d'erreur déguisé en données métier.

import { useCallback, useEffect, useRef, useState } from 'react'

/** Événement global diffusé quand la session est morte (401) — écouter dans le shell. */
export const SESSION_EXPIRED_EVENT = 'yahria:session-expired'

/** Événement global : l'état « me » a changé (ex. 2FA enrôlée/désactivée) — le shell doit recharger. */
export const ME_REFRESH_EVENT = 'yahria:refresh-me'

/** Erreur API typée — le seul type d'échec qu'apiJson peut lever. */
export class ApiFail extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let broadcastDone = false
function broadcastSessionExpired() {
  if (broadcastDone || typeof window === 'undefined') return
  broadcastDone = true
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
  // Filet de sécurité : si le shell n'a pas réagi (état incohérent), redirection dure.
  setTimeout(() => { window.location.href = '/login' }, 1500)
}

/**
 * fetch + JSON typé, avec garantie d'état :
 *  · 2xx  → corps JSON parsé (T)
 *  · !2xx → throw ApiFail(status, message, code?) ; 401 → diffusion globale
 *  · réseau mort / corps illisible → ApiFail(0) ou ApiFail(status, fallback)
 */
export async function apiJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiFail(0, 'Serveur injoignable — vérifiez votre connexion')
  }
  let body: Record<string, unknown> | null = null
  try { body = (await res.json()) as Record<string, unknown> } catch { body = null }
  if (!res.ok) {
    if (res.status === 401) broadcastSessionExpired()
    throw new ApiFail(res.status, (body?.error as string) ?? `Erreur ${res.status}`, body?.code as string | undefined)
  }
  return body as T
}

/** Le verrou d'enrôlement 2FA est-il la cause de l'échec ? */
export function isMfaLock(e: unknown): e is ApiFail {
  return e instanceof ApiFail && e.code === 'MFA_ENROLLMENT_REQUIRED'
}

/** La session est-elle morte (401) ? Dans ce cas la redirection globale est déjà engagée. */
export function isAuthLoss(e: unknown): boolean {
  return e instanceof ApiFail && e.status === 401
}

/** Normalise n'importe quel rejet en ApiFail — pour les catchs des vues. */
export function toApiFail(e: unknown): ApiFail {
  return e instanceof ApiFail ? e : new ApiFail(0, 'Erreur inattendue')
}

export interface UseApiData<T> {
  data: T | null
  error: ApiFail | null
  loading: boolean
  reload: () => void
}

/**
 * Hook de lecture standard : la vue reçoit { data, error, loading, reload } et
 * n'a plus qu'à déléguer l'affichage d'erreur à <LoadError/> (ui.tsx).
 * Un 401 ne remplit PAS error : la redirection globale vers /login prend le relais.
 */
export function useApiData<T>(url: string | null, refreshKey: unknown = 0): UseApiData<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiFail | null>(null)
  const [loading, setLoading] = useState<boolean>(!!url)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => {
    // Appelé depuis des gestionnaires d'événements (bouton, polling) —
    // le setLoading synchrone est autorisé ici, pas dans le corps d'effet.
    setLoading(true)
    setTick((t) => t + 1)
  }, [])
  useEffect(() => {
    if (!url) return
    let cancelled = false
    apiJson<T>(url)
      .then((d) => { if (!cancelled && alive.current) { setData(d); setError(null) } })
      .catch((e: unknown) => {
        if (cancelled || !alive.current) return
        const fail = e instanceof ApiFail ? e : new ApiFail(0, 'Erreur inattendue')
        if (fail.status === 401) return // redirection globale en cours
        setError(fail)
      })
      .finally(() => { if (!cancelled && alive.current) setLoading(false) })
    return () => { cancelled = true }
  }, [url, tick, refreshKey])
  return { data, error, loading, reload }
}
