'use client'

// YAHRIA BUSINESS OS V1 — 02_FINANCE view (invoices, expenses, SYSCOHADA ledger)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge, SectionTitle, fcfa, fmtDate, fmt } from './ui'
import { useToast } from '@/hooks/use-toast'
import { Plus, Send, Ban, BellRing, CheckCircle2, Scale, FileDown, FileSpreadsheet } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface InvLine { description: string; quantity: number; unitPrice: number; vatRate: number; lineTotal: number }
interface Invoice {
  id: string; number: string; status: string; issueDate: string; dueDate: string; subtotal: number
  vatAmount: number; total: number; paidAmount: number; customer: { name: string }; lines: InvLine[]
}
interface Expense { id: string; reference: string; category: string; description: string; amount: number; vatAmount: number; status: string; expenseDate: string }
interface LedgerLine { accountCode: string; accountName: string; debit: number; credit: number }
interface JournalEntry { id: string; entryDate: string; reference: string; description: string; source: string; lines: LedgerLine[] }
interface JournalData { chartOfAccounts: { code: string; name: string; class: number; type: string }[]; entries: JournalEntry[]; ledger: { code: string; name: string; debit: number; credit: number }[]; integrity: { totalDebit: number; totalCredit: number; balanced: boolean } }

function NewInvoiceDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [customerId, setCustomerId] = useState('')
  const [lines, setLines] = useState([{ description: '', quantity: 1, unitPrice: 0 }])
  const [dueDays, setDueDays] = useState('30')
  const [sendNow, setSendNow] = useState(true)

  useEffect(() => {
    if (open) fetch('/api/v1/core/customers').then((r) => r.json()).then((d) => setCustomers(d.items ?? []))
  }, [open])

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const vat = Math.round(subtotal * 0.18)
  const total = subtotal + vat

  function setLine(i: number, patch: Partial<typeof lines[0]>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  async function submit() {
    setBusy(true)
    const res = await fetch('/api/v1/finance/invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, lines: lines.filter((l) => l.description && l.unitPrice > 0), dueDays: Number(dueDays), status: sendNow ? 'SENT' : 'DRAFT' }),
    })
    const d = await res.json()
    setBusy(false)
    if (res.ok) {
      toast({ title: `Facture ${d.item.number} créée`, description: sendNow ? 'Émise — écritures 411/701/4431 postées.' : 'Brouillon — non comptabilisé.' })
      setOpen(false); setLines([{ description: '', quantity: 1, unitPrice: 0 }]); onDone()
    } else toast({ title: 'Erreur', description: d.error, variant: 'destructive' })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nouvelle facture</Button></DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle facture (OHADA)</DialogTitle>
          <DialogDescription>Lignes HT, TVA 18 % (pack CI). L&apos;écriture double-partie n&apos;est postée qu&apos;à l&apos;émission.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Client</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Échéance (jours)</Label>
              <Input type="number" value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
            </div>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_110px_auto] gap-2 items-end">
              <div className="grid gap-1"><Label className="text-xs">Désignation</Label><Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Article / service" /></div>
              <div className="grid gap-1"><Label className="text-xs">Qté</Label><Input type="number" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} /></div>
              <div className="grid gap-1"><Label className="text-xs">PU HT</Label><Input type="number" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} /></div>
              {i > 0 && <Button variant="ghost" size="icon" className="h-9" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</Button>}
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setLines((ls) => [...ls, { description: '', quantity: 1, unitPrice: 0 }])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Ligne
          </Button>
          <div className="rounded-md border px-3 py-2 text-sm space-y-1">
            <div className="flex justify-between text-muted-foreground"><span>Sous-total HT</span><span className="tabular-nums">{fcfa(subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>TVA 18 %</span><span className="tabular-nums">{fcfa(vat)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total TTC</span><span className="tabular-nums">{fcfa(total)}</span></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} className="accent-[oklch(0.78_0.12_220)]" />
            Émettre immédiatement (sinon brouillon, sans écriture)
          </label>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy || !customerId}>{busy ? 'Création…' : 'Créer la facture'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// YAHRIA BUSINESS OS V1 — Export SYSCOHADA (SEC-004)
// Balance générale / grand livre lettré / journaux en PDF ou Excel.
function ExportPanel() {
  const { toast } = useToast()
  const year = new Date().getFullYear()
  const [doc, setDoc] = useState('balance')
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  const DOC_LABEL: Record<string, string> = {
    balance: 'Balance générale (comptes, mouvements, soldes D/C)',
    grandlivre: 'Grand livre (chronologique par compte, lettrage, report à nouveau)',
    journal: 'Journaux (VTE ventes · ACH achats · TRE trésorerie · PAIE · OD)',
  }

  async function download(format: 'pdf' | 'xlsx') {
    setBusy(true)
    try {
      const url = `/api/v1/finance/export?type=${doc}&format=${format}&from=${from}&to=${to}`
      const res = await fetch(url)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast({ title: 'Export refusé', description: d.error ?? `Erreur ${res.status}`, variant: 'destructive' })
        setBusy(false)
        return
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `SYSCOHADA_${doc}_${from}_${to}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
      toast({ title: 'Export généré', description: `${DOC_LABEL[doc].split(' (')[0]} · ${format.toUpperCase()} · ${from} → ${to}` })
    } catch {
      toast({ title: 'Export impossible', description: 'Serveur injoignable', variant: 'destructive' })
    }
    setBusy(false)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2"><FileDown className="h-4 w-4 text-primary" /> États financiers SYSCOHADA — système normal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Du</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Au</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Document</Label>
            <Select value={doc} onValueChange={setDoc}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="balance">Balance générale</SelectItem>
                <SelectItem value="grandlivre">Grand livre lettré</SelectItem>
                <SelectItem value="journal">Journaux comptables</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{DOC_LABEL[doc]}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => download('pdf')} disabled={busy} className="gap-1.5">
              <FileDown className="h-3.5 w-3.5" /> Télécharger PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => download('xlsx')} disabled={busy} className="gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Télécharger Excel
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Conformité de mise en forme</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
          <p>· En-tête entité : raison sociale, NCC, RCCM, pays, monnaie XOF (sans décimales, ISO 4217).</p>
          <p>· Balance groupée par <span className="text-foreground">classes 1 à 8</span> avec contrôle Σ débits = Σ crédits (INV-ACC-001).</p>
          <p>· Grand livre : ligne <span className="text-foreground">à nouveau</span> (antériorité), solde progressif, colonne <span className="text-foreground">lettrage</span> — rapprochement facture ↔ règlement (411/401).</p>
          <p>· Journaux codifiés : chaque écriture est classée dans son journal OHADA d&apos;après sa source.</p>
          <p>· Périmètre : uniquement l&apos;organisation courante (RLS — INV-001), écritures publiées uniquement.</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function FinanceView() {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [journal, setJournal] = useState<JournalData | null>(null)
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [tab, setTab] = useState('invoices')

  const load = useCallback(() => {
    fetch('/api/v1/finance/invoices').then((r) => r.json()).then((d) => setInvoices(d.items ?? []))
    fetch('/api/v1/finance/expenses').then((r) => r.json()).then((d) => setExpenses(d.items ?? []))
    fetch('/api/v1/finance/journal').then((r) => r.json()).then(setJournal)
  }, [])
  useEffect(load, [load])

  async function action(kind: 'SEND' | 'CANCEL' | 'REMIND', id: string) {
    const res = await fetch(`/api/v1/finance/invoices/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: kind }) })
    const d = await res.json()
    if (res.ok) {
      toast({ title: 'Fait', description: kind === 'SEND' ? 'Facture émise — écritures postées.' : kind === 'CANCEL' ? 'Facture annulée.' : 'Relance enregistrée (auditée).' })
      load()
    } else toast({ title: 'Refusé', description: d.error, variant: 'destructive' })
  }

  async function expenseAction(kind: 'APPROVE' | 'PAY', id: string) {
    const res = await fetch('/api/v1/finance/expenses', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: kind, id }) })
    const d = await res.json()
    if (res.ok) { toast({ title: kind === 'PAY' ? 'Dépense réglée — charge comptabilisée' : 'Dépense approuvée' }); load() }
    else toast({ title: 'Refusé', description: d.error, variant: 'destructive' })
  }

  const invoiceStats = useMemo(() => {
    const inv = invoices ?? []
    return {
      total: inv.filter((i) => !['DRAFT', 'CANCELLED'].includes(i.status)).reduce((s, i) => s + i.total, 0),
      open: inv.filter((i) => ['SENT', 'OVERDUE', 'PARTIAL'].includes(i.status)).reduce((s, i) => s + (i.total - i.paidAmount), 0),
      overdue: inv.filter((i) => i.status === 'OVERDUE').length,
    }
  }, [invoices])

  return (
    <div className="space-y-5">
      <SectionTitle
        title="FINANCE — comptabilité OHADA"
        desc="Facturation TVA 18 %, dépenses, grand-livre SYSCOHADA. Invariant INV-ACC-001 : SUM(débit) = SUM(crédit), vérifié en continu."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="expenses">Dépenses</TabsTrigger>
          <TabsTrigger value="accounting">Comptabilité</TabsTrigger>
          <TabsTrigger value="export">Export SYSCOHADA</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4 space-y-3">
          <div className="flex justify-end"><NewInvoiceDialog onDone={load} /></div>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3"><p className="text-xs text-muted-foreground">CA facturé TTC</p><p className="text-lg font-bold tabular-nums">{fcfa(invoiceStats.total)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Encours ouvert</p><p className="text-lg font-bold tabular-nums text-amber-300">{fcfa(invoiceStats.open)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">En retard</p><p className="text-lg font-bold tabular-nums text-red-300">{invoiceStats.overdue} facture(s)</p></Card>
          </div>
          {!invoices && <Skeleton className="h-72" />}
          {invoices && (
            <div className="rounded-lg border overflow-hidden max-h-[30rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>N°</TableHead><TableHead>Client</TableHead><TableHead>Émission</TableHead><TableHead>Échéance</TableHead>
                    <TableHead>HT</TableHead><TableHead>TVA</TableHead><TableHead>TTC</TableHead><TableHead>Statut</TableHead><TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((i) => (
                    <TableRow key={i.id} className="cursor-pointer" onClick={() => setDetail(i)}>
                      <TableCell className="font-mono text-xs">{i.number}</TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">{i.customer.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(i.issueDate)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(i.dueDate)}</TableCell>
                      <TableCell className="text-sm tabular-nums">{fcfa(i.subtotal)}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{fcfa(i.vatAmount)}</TableCell>
                      <TableCell className="text-sm tabular-nums font-semibold">{fcfa(i.total)}</TableCell>
                      <TableCell><StatusBadge status={i.status} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-0.5">
                          {i.status === 'DRAFT' && <Button variant="ghost" size="icon" className="h-7 w-7" title="Émettre" onClick={() => action('SEND', i.id)}><Send className="h-3.5 w-3.5" /></Button>}
                          {(i.status === 'OVERDUE' || i.status === 'SENT') && <Button variant="ghost" size="icon" className="h-7 w-7" title="Relancer" onClick={() => action('REMIND', i.id)}><BellRing className="h-3.5 w-3.5" /></Button>}
                          {['DRAFT', 'SENT', 'OVERDUE'].includes(i.status) && <Button variant="ghost" size="icon" className="h-7 w-7" title="Annuler" onClick={() => action('CANCEL', i.id)}><Ban className="h-3.5 w-3.5" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="rounded-lg border overflow-hidden max-h-[30rem] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead>Réf.</TableHead><TableHead>Desc.</TableHead><TableHead>Montant HT</TableHead><TableHead>TVA</TableHead><TableHead>Date</TableHead><TableHead>Statut</TableHead><TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs">{e.reference}</TableCell>
                        <TableCell className="text-sm max-w-[220px] truncate">{e.description}</TableCell>
                        <TableCell className="text-sm tabular-nums">{fcfa(e.amount)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">{fcfa(e.vatAmount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(e.expenseDate)}</TableCell>
                        <TableCell><StatusBadge status={e.status} /></TableCell>
                        <TableCell>
                          <div className="flex gap-0.5">
                            {e.status === 'PENDING' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => expenseAction('APPROVE', e.id)}><CheckCircle2 className="h-3 w-3 mr-1" />Approuver</Button>}
                            {e.status === 'APPROVED' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => expenseAction('PAY', e.id)}>Régler</Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <ExportPanel />
        </TabsContent>

        <TabsContent value="accounting" className="mt-4 space-y-4">
          {!journal && <Skeleton className="h-72" />}
          {journal && (
            <>
              <Card className={journal.integrity.balanced ? 'border-emerald-500/40' : 'border-red-500/60'}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Scale className="h-4 w-4" /> Contrôle d&apos;intégrité INV-ACC-001
                    <StatusBadge status={journal.integrity.balanced ? 'PASS' : 'FAIL'} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Total débit : <span className="tabular-nums font-semibold text-foreground">{fcfa(journal.integrity.totalDebit)}</span> ·
                  Total crédit : <span className="tabular-nums font-semibold text-foreground">{fcfa(journal.integrity.totalCredit)}</span>
                  {journal.integrity.balanced && ' — grand-livre équilibré, écritures immuables (INV-ACC-003).'}
                </CardContent>
              </Card>

              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Grand-livre (soldes par compte)</CardTitle></CardHeader>
                  <CardContent className="max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Compte</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {journal.ledger.map((l) => (
                          <TableRow key={l.code}>
                            <TableCell className="font-mono text-xs">{l.code}</TableCell>
                            <TableCell className="text-sm max-w-[140px] truncate">{l.name}</TableCell>
                            <TableCell className="text-sm tabular-nums text-right">{fmt(l.debit)}</TableCell>
                            <TableCell className="text-sm tabular-nums text-right">{fmt(l.credit)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Journal (dernières écritures)</CardTitle></CardHeader>
                  <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                    {journal.entries.map((e) => (
                      <div key={e.id} className="rounded-md border px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold font-mono">{e.reference}</span>
                          <span className="text-[10px] text-muted-foreground">{fmtDate(e.entryDate)} · {e.source}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{e.description}</p>
                        <div className="grid gap-0.5">
                          {e.lines.map((l, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                              <span className="font-mono text-muted-foreground">{l.accountCode} — {l.accountName}</span>
                              <span className="tabular-nums">
                                {l.debit > 0 ? <span className="text-emerald-300">D {fmt(l.debit)}</span> : <span className="text-sky-300">C {fmt(l.credit)}</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Plan comptable SYSCOHADA (extrait paramétré)</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {journal.chartOfAccounts.map((a) => (
                      <span key={a.code} className="text-xs border rounded-md px-2 py-1 font-mono">{a.code} · {a.name}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">{detail.number} <StatusBadge status={detail.status} /></DialogTitle>
                <DialogDescription>{detail.customer.name} · émise le {fmtDate(detail.issueDate)} · échéance {fmtDate(detail.dueDate)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5 py-1">
                {detail.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-border/60 pb-1">
                    <span className="truncate max-w-[60%]">{l.description} <span className="text-muted-foreground">×{l.quantity}</span></span>
                    <span className="tabular-nums text-sm">{fcfa(l.lineTotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-muted-foreground pt-1"><span>Sous-total HT</span><span className="tabular-nums">{fcfa(detail.subtotal)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>TVA 18 %</span><span className="tabular-nums">{fcfa(detail.vatAmount)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total TTC</span><span className="tabular-nums">{fcfa(detail.total)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Déjà payé</span><span className="tabular-nums">{fcfa(detail.paidAmount)}</span></div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
