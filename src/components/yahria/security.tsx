'use client'

// YAHRIA BUSINESS OS V1 — Panneau Sécurité (SEC-002 sessions rotatives + SEC-003 2FA)
//  · Sessions actives : vue + révocation unitaire / globale, rotation manuelle
//  · 2FA TOTP : enrôlement (QR + code), codes de récupération, désactivation
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionTitle, fmtDateTime } from './ui'
import { useToast } from '@/hooks/use-toast'
import {
  KeyRound, RefreshCw, Trash2, ShieldCheck, Smartphone, QrCode, ShieldOff, Timer, Lock,
} from 'lucide-react'

interface SessionRow {
  id: string
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  absoluteExpiresAt: string
  current: boolean
}

interface MeState {
  role: string
  email: string
  totpEnabled: boolean
  mfaRequired: boolean
}

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Client inconnu'
  if (/curl|wget|python|postman|insomnia/i.test(ua)) return 'Outil API (curl/script)'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari'
  return 'Navigateur'
}

export function SecurityView() {
  const { toast } = useToast()
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [me, setMe] = useState<MeState | null>(null)
  const [busy, setBusy] = useState(false)

  // 2FA enrolment state
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string; otpauth: string } | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [disablePassword, setDisablePassword] = useState('')
  const [showDisable, setShowDisable] = useState(false)

  const load = useCallback(() => {
    fetch('/api/v1/auth/sessions').then((r) => r.json()).then((d) => setSessions(d.sessions ?? []))
    fetch('/api/v1/auth/me').then((r) => r.json()).then((d) => setMe(d.user ?? null))
  }, [])
  useEffect(load, [load])

  async function revoke(id: string) {
    const res = await fetch('/api/v1/auth/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    const d = await res.json()
    if (!res.ok) { toast({ title: 'Révocation refusée', description: d.error }); return }
    toast({ title: 'Session révoquée', description: 'Le cookie correspondant est immédiatement invalide.' })
    load()
  }

  async function revokeAllOthers() {
    const res = await fetch('/api/v1/auth/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
    const d = await res.json()
    if (!res.ok) { toast({ title: 'Révocation refusée', description: d.error }); return }
    toast({ title: `${d.revoked} session(s) révoquée(s)`, description: 'Toutes vos autres sessions ont été fermées.' })
    load()
  }

  async function rotate() {
    setBusy(true)
    const res = await fetch('/api/v1/auth/session/rotate', { method: 'POST' })
    setBusy(false)
    if (!res.ok) { toast({ title: 'Rotation impossible', description: (await res.json()).error }); return }
    toast({ title: 'Session rotée', description: 'Nouveau token émis — l\u2019ancien devient un piège à rejeu (révocation familiale).' })
    load()
  }

  async function startSetup() {
    setBusy(true)
    const res = await fetch('/api/v1/auth/2fa/setup', { method: 'POST' })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { toast({ title: 'Enrôlement impossible', description: d.error }); return }
    setSetup({ secret: d.secret, qrDataUrl: d.qrDataUrl, otpauth: d.otpauth })
  }

  async function enable2fa() {
    setBusy(true)
    const res = await fetch('/api/v1/auth/2fa/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { toast({ title: 'Activation refusée', description: d.error }); return }
    setRecovery(d.recoveryCodes)
    setSetup(null)
    setCode('')
    toast({ title: '2FA activée', description: 'Conservez les codes de récupération en lieu sûr.' })
    load()
  }

  async function disable2fa() {
    setBusy(true)
    const res = await fetch('/api/v1/auth/2fa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: disablePassword }) })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { toast({ title: 'Désactivation refusée', description: d.error }); return }
    setShowDisable(false)
    setDisablePassword('')
    toast({ title: '2FA désactivée' })
    load()
  }

  if (!sessions || !me) return <div className="space-y-3"><Skeleton className="h-64" /></div>

  return (
    <div className="space-y-5">
      <SectionTitle
        title="SÉCURITÉ — sessions rotatives & 2FA"
        desc="TTL glissant 7 j · plafond absolu 30 j · rotation à chaque rotation de token · tout rejeu d'un ancien token révoque la famille entière. 2FA TOTP obligatoire pour OWNER et CFO."
      />

      {me.mfaRequired && !me.totpEnabled && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Double authentification requise — accès applicatif verrouillé</p>
              <p className="text-xs text-muted-foreground mt-1">
                Votre rôle ({me.role}) impose la 2FA. Toutes les fonctions (Finance, Money, Core…) restent bloquées
                tant que l&apos;enrôlement n&apos;est pas terminé. Configurez-la ci-dessous — 2 minutes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 2FA TOTP ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" /> Double authentification (TOTP)
          </CardTitle>
          {me.totpEnabled ? (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px]">ACTIVE</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">INACTIVE</Badge>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {!me.totpEnabled && !setup && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground max-w-xl">
                Protégez votre compte avec une application authentificatrice (Google Authenticator, Aegis, 1Password…).
                8 codes de récupération à usage unique sont générés à l&apos;activation.
              </p>
              <Button size="sm" onClick={startSetup} disabled={busy} className="gap-1.5">
                <QrCode className="h-3.5 w-3.5" /> Configurer la 2FA
              </Button>
            </div>
          )}

          {setup && (
            <div className="grid md:grid-cols-[240px_1fr] gap-4 items-start border rounded-lg p-4">
              <img src={setup.qrDataUrl} alt="QR code d'enrôlement TOTP" className="rounded-lg border bg-white p-1 w-[220px] h-[220px]" />
              <div className="space-y-3">
                <p className="text-sm font-medium">1. Scannez le QR code</p>
                <p className="text-xs text-muted-foreground">
                  Ou saisissez manuellement le secret dans votre application :
                  <span className="block mt-1 font-mono text-xs bg-muted rounded px-2 py-1 select-all">{setup.secret}</span>
                </p>
                <p className="text-sm font-medium">2. Saisissez le code à 6 chiffres</p>
                <div className="flex gap-2">
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} inputMode="numeric" className="w-32 font-mono tracking-widest text-center" />
                  <Button size="sm" onClick={enable2fa} disabled={busy || code.length !== 6}>Vérifier & activer</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSetup(null)}>Annuler</Button>
                </div>
              </div>
            </div>
          )}

          {recovery && (
            <Dialog open onOpenChange={() => setRecovery(null)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Codes de récupération — à conserver</DialogTitle></DialogHeader>
                <p className="text-xs text-muted-foreground">
                  Chaque code fonctionne <span className="font-semibold">une seule fois</span> si vous perdez votre téléphone.
                  Ils ne seront plus jamais affichés.
                </p>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-sm bg-muted rounded-lg p-3">
                  {recovery.map((c) => <span key={c}>{c}</span>)}
                </div>
                <Button onClick={() => setRecovery(null)} className="w-full">J&apos;ai bien noté ces codes</Button>
              </DialogContent>
            </Dialog>
          )}

          {me.totpEnabled && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground max-w-xl">
                Une deuxième étape TOTP est demandée à chaque connexion. La désactivation exige votre mot de passe
                et réactive le verrou d&apos;enrôlement pour les rôles OWNER/CFO.
              </p>
              <Button size="sm" variant="outline" onClick={() => setShowDisable(true)} className="gap-1.5 text-red-400 border-red-500/40 hover:bg-red-500/10">
                <ShieldOff className="h-3.5 w-3.5" /> Désactiver la 2FA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Sessions actives ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" /> Sessions actives ({sessions.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={rotate} disabled={busy} className="h-8 gap-1.5 text-xs">
              <RefreshCw className="h-3 w-3" /> Rotater ma session
            </Button>
            {sessions.filter((s) => !s.current).length > 0 && (
              <Button size="sm" variant="outline" onClick={revokeAllOthers} className="h-8 gap-1.5 text-xs">
                <ShieldCheck className="h-3 w-3" /> Fermer les autres
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Appareil</th>
                  <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Créée</th>
                  <th className="text-left font-medium px-3 py-2">Dernière activité</th>
                  <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">Expiration (glissante)</th>
                  <th className="text-right font-medium px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t">
                    <TableCellLike>
                      <span className="font-medium">{deviceLabel(s.userAgent)}</span>
                      {s.current && <Badge className="ml-2 bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[9px]">CETTE SESSION</Badge>}
                    </TableCellLike>
                    <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{fmtDateTime(s.createdAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(s.lastSeenAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">
                      {fmtDateTime(s.expiresAt)}
                      <span className="block text-[10px] opacity-70">plafond : {fmtDateTime(s.absoluteExpiresAt)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.current ? (
                        <span className="text-[10px] text-muted-foreground italic">active</span>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1" onClick={() => revoke(s.id)}>
                          <Trash2 className="h-3 w-3" /> Révoquer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Aucune session active</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            Politique appliquée par construction : inactivité maximale 7 jours (TTL glissant, plafonné à 30 jours),
            rotation systématique du token, détection de rejeu avec révocation de la famille — le tout tracé dans l&apos;audit.
          </p>
        </CardContent>
      </Card>

      <Dialog open={showDisable} onOpenChange={setShowDisable}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-base">Confirmer la désactivation</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Saisissez votre mot de passe pour confirmer. Vos codes de récupération seront détruits.</p>
          <Input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Mot de passe" />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowDisable(false)}>Annuler</Button>
            <Button size="sm" variant="destructive" onClick={disable2fa} disabled={!disablePassword || busy}>Désactiver</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TableCellLike({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>
}
