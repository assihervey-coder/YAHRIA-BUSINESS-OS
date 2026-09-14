'use client'

// YAHRIA BUSINESS OS V1 — Administration RBAC (users.manage)
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { SectionTitle, LoadError, fmtDateTime } from './ui'
import { apiJson, ApiFail, isAuthLoss, toApiFail } from '@/lib/yahria/client-api'
import { useToast } from '@/hooks/use-toast'
import { Users as UsersIcon, UserPlus, Ban, CheckCircle2, ShieldCheck } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

const ROLES = ['OWNER', 'ADMIN', 'CFO', 'ACCOUNTANT', 'OPS', 'AUDITOR']
const ROLE_DESC: Record<string, string> = {
  OWNER: 'Accès total (y compris gouvernance avancée)',
  ADMIN: 'Administration système, policies, utilisateurs',
  CFO: 'Finance + Money + approbations (décideur)',
  ACCOUNTANT: 'Écrit la finance mais n\'approuve pas (séparation des pouvoirs)',
  OPS: 'Core métier + lectures finance',
  AUDITOR: 'Lecture seule + audit + evidence',
}

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  status: string
  lastLoginAt: string | null
  createdAt: string
  org: { name: string; countryCode: string }
  permissions: number
}

export function UsersView() {
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [me, setMe] = useState<{ name: string; role: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'OPS', password: 'Demo2026!' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiFail | null>(null)

  const load = useCallback(() => {
    apiJson<{ users?: UserRow[] }>('/api/v1/users')
      .then((d) => { setUsers(d.users ?? []); setError(null) })
      .catch((e: unknown) => { if (!isAuthLoss(e)) setError(toApiFail(e)) })
    apiJson<{ user?: { name: string; role: string } }>('/api/v1/auth/me').then((d) => setMe(d.user ?? null)).catch(() => {})
  }, [])
  useEffect(load, [load])

  async function createUser() {
    setBusy(true)
    const res = await fetch('/api/v1/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { toast({ title: 'Création refusée', description: data.error }); return }
    toast({ title: 'Utilisateur créé', description: `${form.name} — rôle ${form.role} (audité)` })
    setOpen(false)
    setForm({ name: '', email: '', role: 'OPS', password: 'Demo2026!' })
    load()
  }

  async function patchUser(id: string, data: Record<string, string>) {
    const res = await fetch('/api/v1/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...data }),
    })
    const out = await res.json()
    if (!res.ok) { toast({ title: 'Modification refusée', description: out.error }); return }
    toast({ title: 'Compte mis à jour' })
    load()
  }

  if (error) return <div className="space-y-3"><LoadError error={error} onRetry={load} /></div>
  if (!users) return <div className="space-y-3"><Skeleton className="h-64" /></div>

  return (
    <div className="space-y-5">
      <SectionTitle
        title="UTILISATEURS — RBAC multi-tenant"
        desc="Comptes, rôles et permissions du tenant. Séparation des pouvoirs appliquée : le comptable écrit, le DFC approuve, l'auditeur lit tout et ne modifie rien."
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {ROLES.map((r) => (
          <Card key={r}>
            <CardContent className="pt-4 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold font-mono">{r} <span className="text-muted-foreground font-sans">· {users.filter((u) => u.role === r).length} compte(s)</span></p>
                <p className="text-[11px] text-muted-foreground leading-snug">{ROLE_DESC[r]}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><UsersIcon className="h-4 w-4 text-primary" /> Comptes du tenant ({users.length})</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Créer un compte</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle className="text-base">Nouvel utilisateur</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs text-muted-foreground">Nom complet</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Awa Koné" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Email</label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="awa@entreprise.ci" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Rôle</label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{r} — {ROLE_DESC[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Mot de passe initial</label>
                  <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <Button onClick={createUser} disabled={busy || !form.name || !form.email} className="w-full">
                  {busy ? 'Création…' : 'Créer le compte'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Dernière connexion</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{u.name}{me && u.name === me.name && <span className="text-[10px] text-primary ml-1.5">(vous)</span>}</p>
                      <p className="text-[11px] text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={(v) => patchUser(u.id, { role: v })}>
                        <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.status === 'ACTIVE'
                        ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px]">ACTIF</Badge>
                        : <Badge className="bg-red-500/15 text-red-400 border-red-500/40 text-[10px]">SUSPENDU</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'jamais'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                        disabled={me?.name === u.name}
                        onClick={() => patchUser(u.id, { status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}
                      >
                        {u.status === 'ACTIVE' ? <><Ban className="h-3 w-3" /> Suspendre</> : <><CheckCircle2 className="h-3 w-3" /> Réactiver</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
