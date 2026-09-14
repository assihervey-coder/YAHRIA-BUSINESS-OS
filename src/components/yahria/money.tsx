'use client'

// YAHRIA BUSINESS OS V1 — 01_MONEY view (accounts, payments orchestration, reconciliation)
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, SectionTitle, LoadError, fcfa, fmtDateTime, fmtDate, xof } from './ui'
import { apiJson, ApiFail, isAuthLoss, toApiFail } from '@/lib/yahria/client-api'
import { useToast } from '@/hooks/use-toast'
import { Landmark, Smartphone, Coins, Plus, RefreshCcw, ShieldCheck, Route, FileCheck2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Account { id: string; name: string; type: string; provider: string; balance: number; isDefault: boolean }
interface Payment {
  id: string; reference: string; type: string; direction: string; amount: number; fee: number
  counterpartyName: string; counterpartyType: string; method: string; provider: string
  status: string; policyDecision: string | null; policyReason: string | null
  riskScore: number; riskLevel: string; initiatedByType: string; initiatedByName: string
  evidenceId: string | null; invoiceNumber: string | null; createdAt: string; executedAt: string | null
  timeline: string
}
interface Recon { id: string; externalRef: string; provider: string; amount: number; matched: boolean; variance: number; payment: { reference: string; counterpartyName: string }; reconciledAt: string }

const accIcon = (t: string) => (t === 'BANK' ? <Landmark className="h-4 w-4" /> : t === 'MOBILE_MONEY' ? <Smartphone className="h-4 w-4" /> : <Coins className="h-4 w-4" />)

function NewPaymentDialog({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [type, setType] = useState('DISBURSEMENT')
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [cpType, setCpType] = useState('SUPPLIER')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [sourceId, setSourceId] = useState(accounts.find((a) => a.isDefault)?.id ?? '')
  const [destId, setDestId] = useState('')
  const [reason, setReason] = useState('')
  const [trace, setTrace] = useState<{ payment: Payment } | null>(null)

  const outs = accounts.filter((a) => a.type === 'BANK' || a.type === 'MOBILE_MONEY' || a.type === 'CASH')

  async function submit() {
    setBusy(true)
    setTrace(null)
    const res = await fetch('/api/v1/money/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type, amount: Number(amount), counterpartyName: name, counterpartyType: cpType,
        method, sourceAccountId: type !== 'COLLECTION' ? sourceId : null,
        destAccountId: type !== 'DISBURSEMENT' ? destId || sourceId : null,
        reason, idempotencyKey: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }),
    })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) {
      toast({ title: 'Rejeté', description: d.error ?? 'Erreur', variant: 'destructive' })
      return
    }
    setTrace(d)
    toast({
      title: d.replayed ? 'Rejoué (idempotent)' : `Décision : ${d.payment.policyDecision ?? d.payment.status}`,
      description: `${d.payment.reference} — ${d.payment.status}`,
    })
    onDone()
  }

  const steps = trace ? (JSON.parse(trace.payment.timeline || '[]') as { ts: string; state: string; note: string }[]) : []

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTrace(null) }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nouveau paiement</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Orchestration de paiement</DialogTitle>
          <DialogDescription>
            Cycle de vie complet : Idempotence → Policy → Risque → Approbation → Exécution → Comptabilisation → Evidence (spec §18).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DISBURSEMENT">Décaissement (fournisseur)</SelectItem>
                  <SelectItem value="COLLECTION">Encaissement (client)</SelectItem>
                  <SelectItem value="TRANSFER">Virement interne</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Montant (FCFA)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Contrepartie</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du tiers" />
            </div>
            <div className="grid gap-1.5">
              <Label>Type de tiers</Label>
              <Select value={cpType} onValueChange={setCpType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPPLIER">Fournisseur</SelectItem>
                  <SelectItem value="CUSTOMER">Client</SelectItem>
                  <SelectItem value="EMPLOYEE">Employé</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Méthode</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                  <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                  <SelectItem value="CASH">Espèces</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{type === 'COLLECTION' ? 'Compte de réception' : 'Compte source'}</Label>
              <Select value={type === 'COLLECTION' ? destId : sourceId} onValueChange={type === 'COLLECTION' ? setDestId : setSourceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {outs.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} — {xof(a.balance)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {type === 'TRANSFER' && (
            <div className="grid gap-1.5">
              <Label>Compte de destination</Label>
              <Select value={destId} onValueChange={setDestId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} — {xof(a.balance)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Justification (trace d'audit)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex : règlement facture SIF-2026-088" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !amount || !name}>
            {busy ? 'Orchestration…' : 'Soumettre au Policy Engine'}
          </Button>
        </DialogFooter>

        {trace && (
          <div className="rounded-lg border bg-accent/20 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">{trace.payment.reference}</Badge>
              <StatusBadge status={trace.payment.status} />
              <StatusBadge status={trace.payment.policyDecision ?? 'INFO'} />
              <span className="text-muted-foreground">risque {trace.payment.riskScore}/100 ({trace.payment.riskLevel})</span>
            </div>
            {trace.payment.policyReason && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5"><ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />{trace.payment.policyReason}</p>
            )}
            <div className="space-y-1.5 pt-1">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <StatusBadge status={s.state} className="w-36 justify-center shrink-0" />
                  <span className="text-muted-foreground leading-snug">{s.note}</span>
                </div>
              ))}
            </div>
            {trace.payment.evidenceId && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><FileCheck2 className="h-3.5 w-3.5" />Evidence {trace.payment.evidenceId} + écriture comptable postée (débit = crédit)</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MoneyView() {
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [recos, setRecos] = useState<Recon[]>([])
  const [filter, setFilter] = useState('ALL')
  const [error, setError] = useState<ApiFail | null>(null)

  const load = useCallback(() => {
    apiJson<{ accounts?: Account[]; payments?: Payment[]; reconciliations?: Recon[] }>('/api/v1/money/payments')
      .then((d) => { setAccounts(d.accounts ?? []); setPayments(d.payments ?? []); setRecos(d.reconciliations ?? []); setError(null) })
      .catch((e: unknown) => { if (!isAuthLoss(e)) setError(toApiFail(e)) })
  }, [])
  useEffect(load, [load])

  async function reconcile(paymentId: string) {
    // Demo reconciliation: create a matched external ref via finance API not needed — simulated here via payments PATCH
    const res = await fetch('/api/v1/money/payments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RECONCILE', paymentId, externalRef: `MAN-${Date.now()}` }),
    })
    if (res.ok) { toast({ title: 'Rapprochement enregistré', description: 'Divergences conservées comme événements (INV-REC-003).' }); load() }
    else toast({ title: 'Échec', variant: 'destructive' })
  }

  if (error) return <LoadError error={error} onRetry={load} />
  if (!accounts) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>

  const filtered = payments.filter((p) => filter === 'ALL' || p.type === filter)
  const total = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="space-y-5">
      <SectionTitle
        title="MONEY — couche financière transactionnelle"
        desc="Comptes, collections, disbursements, transfers, orchestration, réconciliation — tout mouvement est routé, risqué, audité et rapproché."
        right={<NewPaymentDialog accounts={accounts} onDone={load} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {accounts.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">{accIcon(a.type)}<span className="truncate">{a.provider}</span></div>
            <p className="text-lg font-bold tabular-nums leading-tight">{xof(a.balance)}</p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">{a.name}{a.isDefault ? ' · défaut' : ''}</p>
          </Card>
        ))}
        <Card className="p-4 border-primary/40">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Route className="h-4 w-4" />TOTAL</div>
          <p className="text-lg font-bold tabular-nums leading-tight text-primary">{xof(total)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">position consolidée</p>
        </Card>
      </div>

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="reco">Rapprochements</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-4 space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {['ALL', 'COLLECTION', 'DISBURSEMENT', 'TRANSFER'].map((t) => (
              <button key={t} onClick={() => setFilter(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filter === t ? 'bg-primary/20 border-primary/50 text-primary' : 'border-border text-muted-foreground hover:bg-accent/40'}`}>
                {t === 'ALL' ? 'Tous' : t === 'COLLECTION' ? 'Encaissements' : t === 'DISBURSEMENT' ? 'Décaissements' : 'Virements'}
              </button>
            ))}
          </div>
          <div className="rounded-lg border overflow-hidden max-h-[30rem] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Tiers</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>Initié par</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{p.counterpartyName}</TableCell>
                    <TableCell className="text-sm tabular-nums font-semibold whitespace-nowrap">
                      <span className={p.direction === 'IN' ? 'text-emerald-300' : p.direction === 'OUT' ? 'text-red-300' : ''}>
                        {p.direction === 'IN' ? '+' : p.direction === 'OUT' ? '−' : '↔'} {fcfa(p.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.method === 'BANK_TRANSFER' ? 'Virement' : p.method === 'MOBILE_MONEY' ? p.provider : 'Espèces'}</TableCell>
                    <TableCell><StatusBadge status={p.policyDecision ?? 'INFO'} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.initiatedByType === 'AGENT' ? <Badge variant="outline" className="text-[10px] border-fuchsia-500/40 text-fuchsia-300">{p.initiatedByName}</Badge> : p.initiatedByName}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>
                      {p.status === 'EXECUTED' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Rapprocher" onClick={() => reconcile(p.id)}>
                          <RefreshCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="reco" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Rapprochements (RECONCILIATION)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {recos.length === 0 && <p className="text-sm text-muted-foreground">Aucun rapprochement — cliquez sur ⟳ en face d'un paiement exécuté.</p>}
              {recos.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.payment.reference} — {r.payment.counterpartyName}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{r.externalRef} · {r.provider} · {fmtDate(r.reconciledAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm tabular-nums">{fcfa(r.amount)}</span>
                    <StatusBadge status={r.matched ? 'RECONCILED' : 'PENDING'} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

void fmtDateTime
