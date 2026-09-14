'use client'

// YAHRIA BUSINESS OS V1 — Porte d'enrôlement 2FA (SEC-003 · parcours « 2FA avant plateforme »)
// Rendue SUR LA PAGE DE CONNEXION après validation du mot de passe lorsque le
// compte relève d'une vague 2FA active sans enrôlement. Tant qu'un premier code
// TOTP n'est pas validé (/2fa/enable), la session provisionnelle ne permet
// AUCUN accès métier (withAuth — whitelist auth uniquement) : /app reste
// structurellement hors de portée. Le mur MFA in-app demeure en défense de
// profondeur (session héritée, onglet resté ouvert, bookmark…).
// Mode démo (YAHRIA_DEMO_2FA=assist) : le code TOTP courant est récupéré via
// /api/v1/auth/2fa/demo-code (route authentifiée) et auto-rempli. En 'strict',
// la route refuse — l'erreur est ignorée silencieusement : zéro artifice affiché.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KeyRound, Loader2, RefreshCw, ShieldCheck, Smartphone, Sparkles } from 'lucide-react'

interface SetupPayload { secret: string; qrDataUrl: string }
interface DemoCodeHint { code: string; remainingSec: number }

export function TotpEnrollmentGate({ onEnterPlatform }: { onEnterPlatform: () => void }) {
  const [setup, setSetup] = useState<SetupPayload | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<string[] | null>(null)
  // Assistance MODE DÉMO : code TOTP courant affiché + compte à rebours
  const [demoHint, setDemoHint] = useState<DemoCodeHint | null>(null)

  /** Enrôlement : génère le secret + QR (POST /2fa/setup), puis assistance démo.
   *  Toutes les mutations d'état se font dans les callbacks de réponse —
   *  pattern « subscribe » (aucun setState synchrone au corps d'effet). */
  const runSetup = useCallback((signal?: AbortSignal) => {
    fetch('/api/v1/auth/2fa/setup', { method: 'POST', signal })
      .then((res) =>
        res.json().then((d: { error?: string; secret?: string; qrDataUrl?: string }) => {
          if (!res.ok) {
            setSetupError(d.error ?? 'Enrôlement impossible')
            return undefined
          }
          setSetup({ secret: d.secret ?? '', qrDataUrl: d.qrDataUrl ?? '' })
          // Assistance démo : auto-remplissage du code courant (silencieux en 'strict')
          return fetch('/api/v1/auth/2fa/demo-code', { method: 'POST', signal })
            .then((r2) => r2.json())
            .then((d2: Partial<DemoCodeHint>) => {
              if (d2?.code) {
                setDemoHint({ code: d2.code, remainingSec: d2.remainingSec ?? 30 })
                setCode(d2.code)
              }
            })
            .catch(() => {})
        })
      )
      .catch((e: unknown) => {
        if ((e as Error)?.name === 'AbortError') return
        setSetupError('Serveur injoignable')
      })
  }, [])

  /** Relance manuelle (bouton Réessayer) : purge l'état puis redémarre l'enrôlement. */
  function retrySetup() {
    setSetup(null)
    setSetupError(null)
    setCode('')
    setDemoHint(null)
    setError(null)
    runSetup()
  }

  // Démarrage automatique de l'enrôlement au montage de la porte (AbortController : sûr en StrictMode)
  useEffect(() => {
    const ac = new AbortController()
    runSetup(ac.signal)
    return () => ac.abort()
  }, [runSetup])

  // Compte à rebours du code démo affiché
  useEffect(() => {
    if (!demoHint) return
    const t = setInterval(() => {
      setDemoHint((d) => (d ? { ...d, remainingSec: d.remainingSec - 1 } : d))
    }, 1000)
    return () => clearInterval(t)
  }, [demoHint?.code])

  /** Renouvelle le code démo affiché (rotation TOTP 30 s). */
  async function refreshDemoCode() {
    try {
      const res = await fetch('/api/v1/auth/2fa/demo-code', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return
      setDemoHint({ code: d.code, remainingSec: d.remainingSec })
      setCode(d.code)
    } catch {}
  }

  /** Active la 2FA : vérifie un premier code TOTP contre le secret en attente. */
  async function enable2fa() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const d = await res.json().catch(() => ({}))
      setBusy(false)
      if (!res.ok) {
        setError(d.error ?? 'Activation refusée')
        return
      }
      setRecovery(d.recoveryCodes)
    } catch {
      setBusy(false)
      setError('Serveur injoignable')
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs leading-relaxed">
          Dernière étape avant l&apos;accès à la plateforme : votre rôle exige la double
          authentification. Elle s&apos;active ici — la plateforme reste verrouillée
          côté serveur jusqu&apos;à la validation d&apos;un premier code TOTP.
        </p>
      </div>

      {setupError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-2">
          <p className="text-xs text-red-300">{setupError}</p>
          <Button type="button" size="sm" variant="outline" onClick={retrySetup} className="h-7 text-[11px] gap-1.5">
            <RefreshCw className="h-3 w-3" /> Réessayer
          </Button>
        </div>
      )}

      {!setup && !setupError && (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Génération du QR code d&apos;enrôlement…
        </div>
      )}

      {setup && (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-4">
            <img src={setup.qrDataUrl} alt="QR code d'enrôlement TOTP" className="w-40 h-40 rounded-lg border bg-white p-1" />
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              1. Scannez avec votre application authentificatrice (Google Authenticator, Aegis, 1Password…)
              ou saisissez le secret manuellement :
            </p>
            <p className="font-mono text-[11px] bg-muted rounded px-2 py-1 select-all break-all text-center">{setup.secret}</p>
          </div>

          {demoHint && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold tracking-wider text-amber-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> MODE DÉMO — CODE ACTUEL
                </p>
                <span className={`text-[10px] font-mono ${demoHint.remainingSec > 5 ? 'text-amber-300' : 'text-red-400'}`}>
                  {demoHint.remainingSec > 0 ? `${demoHint.remainingSec}s` : 'roté — renouvelez'}
                </span>
              </div>
              <p className="mt-1 font-mono text-2xl font-bold tracking-[0.35em] text-amber-200 text-center select-all">
                {demoHint.code}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full mt-2 h-7 text-[11px] border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                disabled={busy}
                onClick={refreshDemoCode}
              >
                <RefreshCw className="h-3 w-3" /> Nouveau code (démo)
              </Button>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">2. Code de vérification</label>
            <input
              type="text"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono tracking-widest text-center outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="button" disabled={busy || code.length !== 6} onClick={enable2fa} className="w-full h-10 gap-2 font-semibold">
            <KeyRound className="h-4 w-4" /> {busy ? 'Activation…' : 'Vérifier & activer'}
          </Button>
        </div>
      )}

      {recovery && (
        <Dialog open onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> Codes de récupération — à conserver
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Chaque code fonctionne <span className="font-semibold">une seule fois</span> si vous perdez votre téléphone.
              Ils ne seront plus jamais affichés.
            </p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-sm bg-muted rounded-lg p-3">
              {recovery.map((c) => <span key={c}>{c}</span>)}
            </div>
            <Button className="w-full gap-2" onClick={onEnterPlatform}>
              <Smartphone className="h-4 w-4" /> J&apos;ai noté mes codes — Accéder à la plateforme
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
