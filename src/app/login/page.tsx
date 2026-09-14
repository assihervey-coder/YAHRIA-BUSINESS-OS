'use client'

// YAHRIA BUSINESS OS V1 — Page de connexion (RBAC multi-tenant + 2FA TOTP en 2 étapes)
// Mode démo (YAHRIA_DEMO_2FA=assist) : le code TOTP courant est affiché et
// auto-rempli — la double authentification est démontrée de bout en bout sans
// application authentificatrice. En 'strict' : aucune assistance.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LogIn, ShieldCheck, Lock, Smartphone, KeyRound, RefreshCw, Sparkles } from 'lucide-react'

interface DemoAssist { code: string; period: number; remainingSec: number }

interface DemoAccount {
  name: string
  email: string
  role: string
  roleLabel: string
  org: string
  country: string
  tenant: string
}

const FLAG: Record<string, string> = { CI: '\u{1F1E8}\u{1F1EE}', SN: '\u{1F1F8}\u{1F1F3}', BJ: '\u{1F1E7}\u{1F1EF}' }

export default function LoginPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<DemoAccount[]>([])
  const [demoPassword, setDemoPassword] = useState('Demo2026!')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Étape 2 — défi 2FA émis après validation du mot de passe
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  // Assistance démo : code TOTP courant affiché + compte à rebours
  const [demoAssist, setDemoAssist] = useState<DemoAssist | null>(null)

  useEffect(() => {
    if (!demoAssist) return
    const t = setInterval(() => {
      setDemoAssist((d) => (d ? { ...d, remainingSec: d.remainingSec - 1 } : d))
    }, 1000)
    return () => clearInterval(t)
  }, [demoAssist?.code])

  useEffect(() => {
    fetch('/api/v1/auth/demo').then((r) => r.json()).then((d) => {
      setAccounts(d.accounts ?? [])
      if (d.demoPassword) setDemoPassword(d.demoPassword)
    }).catch(() => {})
  }, [])

  async function login(em: string, pw: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, password: pw }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Connexion impossible')
        setBusy(false)
        return
      }
      if (data.mfaRequired) {
        // Étape 2 : vérification TOTP (le défi relie les deux étapes)
        setMfaChallenge(data.challenge)
        setMfaCode('')
        if (data.demoAssist) {
          setDemoAssist(data.demoAssist)
          setMfaCode(data.demoAssist.code) // auto-remplissage mode démo
        } else {
          setDemoAssist(null)
        }
        setBusy(false)
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Serveur injoignable')
      setBusy(false)
    }
  }

  async function verifyMfa() {
    if (!mfaChallenge) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: mfaChallenge, code: mfaCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Code invalide')
        setBusy(false)
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Serveur injoignable')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh dark bg-background text-foreground flex items-center justify-center p-4" style={{ colorScheme: 'dark' }}>
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 items-stretch">
        {/* ── Panneau marque ── */}
        <div className="hidden md:flex flex-col justify-between rounded-2xl border border-border bg-sidebar p-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[oklch(0.8_0.12_220)] to-[oklch(0.6_0.14_240)] flex items-center justify-center font-black text-lg text-[oklch(0.16_0.04_255)]">Y</div>
              <div>
                <p className="font-black tracking-tight leading-none">YAHRIA</p>
                <p className="text-[11px] text-muted-foreground mt-1">BUSINESS OS · V1</p>
              </div>
            </div>
            <h1 className="mt-10 text-2xl font-bold leading-snug tracking-tight">
              Le système d&apos;exploitation<br />intelligent des entreprises<br />africaines.
            </h1>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              Données → Intelligence → Décision → Exécution, sous gouvernance :
              RBAC multi-tenant, RLS applicatif, Evidence signées HMAC-SHA256,
              isolation Country Pack (INV-011).
            </p>
          </div>
          <div className="space-y-2 text-[11px] text-muted-foreground">
            <p className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Session chiffrée · rotation · détection de rejeu · scrypt</p>
            <p className="flex items-center gap-2"><Lock className="h-3.5 w-3.5 text-primary" /> Chaque requête bornée à votre tenant (INV-001)</p>
            <p className="flex items-center gap-2"><Smartphone className="h-3.5 w-3.5 text-primary" /> 2FA TOTP obligatoire — verrouillage progressif sur tous les rôles (vagues)</p>
            <p className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> Mode démo : le code TOTP courant est affiché à l&apos;écran (assist)</p>
            <p className="font-mono pt-3 border-t border-border/60">YBOS-ARCH-V1 · baseline 1.2.0 · multi-tenant</p>
          </div>
        </div>

        {/* ── Formulaire ── */}
        <div className="rounded-2xl border border-border bg-card p-7 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-2.5 mb-6">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[oklch(0.8_0.12_220)] to-[oklch(0.6_0.14_240)] flex items-center justify-center font-black text-[13px] text-[oklch(0.16_0.04_255)]">Y</div>
            <p className="font-bold">YAHRIA BUSINESS OS</p>
          </div>
          <h2 className="text-lg font-bold">Connexion</h2>
          <p className="text-xs text-muted-foreground mt-1">Accédez à votre espace tenant.</p>

          {mfaChallenge ? (
            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => { e.preventDefault(); verifyMfa() }}
            >
              <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 flex items-start gap-2.5">
                <Smartphone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed">
                  Double authentification : saisissez le code à 6 chiffres de votre application
                  authentificatrice — ou un code de récupération (XXXX-XXXX).
                </p>
              </div>
              {demoAssist && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold tracking-wider text-amber-400">MODE DÉMO — CODE ACTUEL</p>
                    <span className={`text-[10px] font-mono ${demoAssist.remainingSec > 5 ? 'text-amber-300' : 'text-red-400'}`}>
                      {demoAssist.remainingSec > 0 ? `${demoAssist.remainingSec}s` : 'roté — renouvelez'}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-2xl font-bold tracking-[0.35em] text-amber-200 text-center select-all">
                    {demoAssist.code}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 h-7 text-[11px] border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                    disabled={busy}
                    onClick={() => login(email, password)}
                  >
                    <RefreshCw className="h-3 w-3" /> Nouveau code (re-défi)
                  </Button>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Code de vérification</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456 ou AB12-CD34"
                  className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono tracking-widest text-center outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
              )}
              <Button type="submit" disabled={busy || mfaCode.length < 6} className="w-full h-10 gap-2 font-semibold">
                <KeyRound className="h-4 w-4" /> {busy ? 'Vérification…' : 'Vérifier et se connecter'}
              </Button>
              <Button type="button" variant="ghost" className="w-full h-8 text-xs text-muted-foreground" onClick={() => { setMfaChallenge(null); setError(null) }}>
                Retour à la saisie du mot de passe
              </Button>
            </form>
          ) : (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => { e.preventDefault(); login(email, password) }}
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email professionnel</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@entreprise.ci"
                className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mot de passe</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
            )}
            <Button type="submit" disabled={busy} className="w-full h-10 gap-2 font-semibold">
              <LogIn className="h-4 w-4" /> {busy ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
          )}

          {/* ── Comptes de démonstration ── */}
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Comptes de démonstration — mot de passe : <span className="font-mono text-foreground">{demoPassword}</span>
            </p>
            {!accounts.length ? (
              <div className="mt-3 space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
            ) : (
              <div className="mt-3 max-h-56 overflow-y-auto os-scroll overscroll-contain space-y-1.5 pr-1">
                {accounts.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    disabled={busy}
                    onClick={() => { setEmail(a.email); setPassword(demoPassword); login(a.email, demoPassword) }}
                    className="w-full flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-accent/60 transition-colors disabled:opacity-50"
                  >
                    <span className="text-base leading-none">{FLAG[a.country] ?? '\u{1F3F4}'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium truncate">{a.name} · <span className="text-primary">{a.roleLabel}</span></span>
                      <span className="block text-[10px] text-muted-foreground truncate">{a.email} — {a.org}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
