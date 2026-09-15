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
import { StatusBadge, SectionTitle, LoadError, fcfa, fmtDate, fmt } from './ui'
import { apiJson, ApiFail } from '@/lib/yahria/client-api'
import { useToast } from '@/hooks/use-toast'
import { Plus, Send, Ban, BellRing, CheckCircle2, Scale, FileDown, FileSpreadsheet, Users, Percent, Landmark, Undo2, TriangleAlert } from 'lucide-react'
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

// ── Paie SYSCOHADA (journal PAIE) ────────────────────────────────────────
interface PayslipRow { id: string; employeeName: string; employeeCode: string; position: string; contractType: string; accountCode: string; gross: number; cnssEmployee: number; cnssEmployer: number; tax: number; net: number }
interface PayRunRow { id: string; reference: string; period: string; status: string; headcount: number; grossTotal: number; cnssEmployeeTotal: number; cnssEmployerTotal: number; taxTotal: number; netTotal: number; currency: string; countryPackCode: string; payslips: PayslipRow[] }
interface PayrollRulesRow { countryCode: string; packCode: string; packVersion: string; socialLabel: string; socialEmployerRate: number; socialEmployeeRate: number; taxLabel: string; scheduleLabel: string; minWage: number; note: string }
interface EmployeeRow { id: string; code: string; name: string; position: string; department: string; contractType: string; grossSalary: number; currency: string }
interface PayrollData { rules: PayrollRulesRow; runs: PayRunRow[]; employees: EmployeeRow[] }

function PayrollPanel({ data, onDone }: { data: PayrollData; onDone: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
  const [detailRun, setDetailRun] = useState<PayRunRow | null>(null)
  const [reverseRun, setReverseRun] = useState<PayRunRow | null>(null)
  const { rules, runs, employees } = data
  const pct = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, '')} %`
  const cumul = runs.reduce((a, r) => ({ gross: a.gross + r.grossTotal, social: a.social + r.cnssEmployeeTotal + r.cnssEmployerTotal, tax: a.tax + r.taxTotal, net: a.net + r.netTotal }), { gross: 0, social: 0, tax: 0, net: 0 })
  const alreadyClosed = runs.some((r) => r.period === period && r.status === 'POSTED')

  async function close() {
    setBusy(true)
    const res = await fetch('/api/v1/finance/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period }) })
    const d = await res.json()
    setBusy(false)
    setOpen(false)
    if (res.ok) {
      toast({ title: `Paie clôturée — journal PAIE`, description: `${d.item.headcount} bulletins · net ${fcfa(d.item.net)} — écritures 661x / 6641 / 4311 / 4321 / 4221 postées.` })
      onDone()
    } else toast({ title: 'Clôture refusée', description: d.error, variant: 'destructive' })
  }

  function openPdf(payslipId: string) {
    window.open(`/api/v1/finance/payroll/payslip/${payslipId}/pdf`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Personnel actif</p><p className="text-lg font-bold tabular-nums">{employees.length} <Users className="inline h-4 w-4 text-primary" /></p><p className="text-[11px] text-muted-foreground">{fcfa(employees.reduce((s, e) => s + e.grossSalary, 0))} brut / mois</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Masse brute versée (cumul)</p><p className="text-lg font-bold tabular-nums">{fcfa(cumul.gross)}</p><p className="text-[11px] text-muted-foreground">{runs.length} clôture(s)</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Charges sociales (cumul)</p><p className="text-lg font-bold tabular-nums text-amber-300">{fcfa(cumul.social)}</p><p className="text-[11px] text-muted-foreground">{rules.socialLabel} {pct(rules.socialEmployeeRate)} / {pct(rules.socialEmployerRate)}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">{rules.taxLabel} retenu (cumul)</p><p className="text-lg font-bold tabular-nums text-sky-300">{fcfa(cumul.tax)}</p><p className="text-[11px] text-muted-foreground">barème progressif mensuel</p></Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" /> Journal de paie — SYSCOHADA
            <StatusBadge status={rules.packCode} />
            <span className="ml-auto"><Button size="sm" onClick={() => setOpen(true)} disabled={busy}><Plus className="h-4 w-4 mr-1" /> Clôturer une période</Button></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Constatation par salarié : <span className="font-mono">D 661x</span> (brut) + <span className="font-mono">D 6641</span> ({rules.socialLabel} patronale {pct(rules.socialEmployerRate)}) / <span className="font-mono">C 4311</span> ({rules.socialLabel}) + <span className="font-mono">C 4321</span> ({rules.taxLabel} retenu) + <span className="font-mono">C 4221</span> (net) — puis paiement <span className="font-mono">D 4221 / C 5211</span>. Paramètres issus du Country Pack {rules.packCode} v{rules.packVersion} (INV-011), figés à la clôture. Correction = contre-passation (INV-007).
          </p>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucune clôture de paie — lancez la première pour poster les écritures au journal PAIE.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden max-h-[26rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Période</TableHead><TableHead>Réf.</TableHead><TableHead>Effectif</TableHead>
                    <TableHead>Brut</TableHead><TableHead>{rules.socialLabel}</TableHead><TableHead>{rules.taxLabel}</TableHead><TableHead>Net payé</TableHead><TableHead>Statut</TableHead><TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailRun(r)}>
                      <TableCell className="text-sm font-medium capitalize">{r.period}</TableCell>
                      <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                      <TableCell className="text-sm tabular-nums">{r.headcount}</TableCell>
                      <TableCell className="text-sm tabular-nums">{fcfa(r.grossTotal)}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{fcfa(r.cnssEmployeeTotal + r.cnssEmployerTotal)}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{fcfa(r.taxTotal)}</TableCell>
                      <TableCell className="text-sm tabular-nums font-semibold">{fcfa(r.netTotal)}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetailRun(r)}>{r.payslips.length} bulletins</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Percent className="h-4 w-4 text-primary" /> Paramètres de paie — pack {rules.packCode} v{rules.packVersion}</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Cotes sociales — {rules.socialLabel}</p>
            <p>Part salariale : <span className="font-semibold tabular-nums">{pct(rules.socialEmployeeRate)}</span> · part patronale : <span className="font-semibold tabular-nums">{pct(rules.socialEmployerRate)}</span></p>
            <p className="text-xs text-muted-foreground">Salaire minimum pack : {fcfa(rules.minWage)} / mois</p>
          </div>
          <div className="rounded-md border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Impôt sur salaires — {rules.taxLabel}</p>
            <p>{rules.scheduleLabel}</p>
            <p className="text-xs text-muted-foreground">Base imposable : brut − part salariale ({rules.socialLabel})</p>
          </div>
          <p className="md:col-span-2 text-[11px] text-muted-foreground leading-relaxed">{rules.note}</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clôturer la paie</DialogTitle>
            <DialogDescription>
              {employees.length} salarié(s) actif(s) — bulletins calculés puis écritures double-partie postées au journal PAIE. La clôture est immuable (INV-007).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-1">
            <Label>Période (YYYY-MM)</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            {alreadyClosed && <p className="text-xs text-amber-300">⚠ La période {period} est déjà clôturée — le serveur refusera (contre-passation requise).</p>}
          </div>
          <DialogFooter><Button onClick={close} disabled={busy || !/\d{4}-\d{2}/.test(period)}>{busy ? 'Clôture…' : 'Clôturer et poster'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailRun} onOpenChange={(o) => !o && setDetailRun(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailRun && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">Paie {detailRun.period} <StatusBadge status={detailRun.status} /></DialogTitle>
                <DialogDescription>{detailRun.reference} · pack {detailRun.countryPackCode} · {detailRun.headcount} bulletins · brut {fcfa(detailRun.grossTotal)} · net {fcfa(detailRun.netTotal)}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border overflow-hidden max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead>Matricule</TableHead><TableHead>Salarié</TableHead><TableHead>Compte</TableHead>
                      <TableHead>Brut</TableHead><TableHead>{rules.socialLabel} sal.</TableHead><TableHead>{rules.taxLabel}</TableHead><TableHead>Net</TableHead><TableHead className="w-16">Bulletin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRun.payslips.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.employeeCode}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{p.employeeName}<span className="text-muted-foreground text-xs"> · {p.position}</span></TableCell>
                        <TableCell className="font-mono text-xs">{p.accountCode}</TableCell>
                        <TableCell className="text-sm tabular-nums">{fcfa(p.gross)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">{fcfa(p.cnssEmployee)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">{fcfa(p.tax)}</TableCell>
                        <TableCell className="text-sm tabular-nums font-semibold">{fcfa(p.net)}</TableCell>
                        <TableCell><Button variant="ghost" size="sm" className="h-7 px-2" title="Bulletin de paie PDF" onClick={() => openPdf(p.id)}><FileDown className="h-4 w-4 text-primary" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {detailRun.status === 'POSTED' && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs text-muted-foreground">Erreur dans cette clôture ? La correction passe par une <span className="font-medium text-foreground">contre-passation guidée</span> : écritures inversées au journal PAIE, bulletins annulés, opération scellée Evidence.</p>
                  <Button size="sm" variant="outline" className="shrink-0 border-amber-500/40 text-amber-300 hover:bg-amber-500/10" onClick={() => setReverseRun(detailRun)}><Undo2 className="h-4 w-4 mr-1" /> Contre-passation guidée</Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <ReversalDialog key={reverseRun?.id ?? 'none'} run={reverseRun} onClose={() => setReverseRun(null)} onDone={onDone} />
    </div>
  )
}

// ── Contre-passation GUIDÉE (3 étapes : avertissement → motif + confirmation → résultat) ──
function ReversalDialog({ run, onClose, onDone }: { run: PayRunRow | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [ack, setAck] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmRef, setConfirmRef] = useState('')
  const [result, setResult] = useState<{ item: { reference: string; reversalTotal: number; headcount: number; evidence: { ref: string; seq: number } } } | null>(null)

  if (!run) return null

  async function submit() {
    setBusy(true)
    const d = await apiJson<{ item: { reference: string; reversalTotal: number; headcount: number; evidence: { ref: string; seq: number } } }>('/api/v1/finance/payroll/reverse', {
      method: 'POST', body: JSON.stringify({ payRunId: run!.id, reason: reason.trim(), confirmRef: confirmRef.trim() }),
    }).catch((e: ApiFail) => { toast({ title: 'Contre-passation refusée', description: e.message, variant: 'destructive' }); return null })
    setBusy(false)
    if (d) {
      setResult(d)
      setStep(3)
      toast({ title: 'Contre-passation scellée', description: `Extourne D=C=${fcfa(d.item.reversalTotal)} postée au journal PAIE · preuve ${d.item.evidence.ref}` })
      onDone()
    }
  }

  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="h-4 w-4 text-amber-300" /> Contre-passation guidée — {run.period}</DialogTitle>
          <DialogDescription>{run.reference} · {run.headcount} bulletins · net {fcfa(run.netTotal)}</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3 py-1">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-300" />
              <div className="text-xs leading-relaxed">
                <p className="font-medium text-amber-200">Ce que fera l&apos;extourne (irréversible)</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
                  <li>Écritures inversées au journal PAIE (miroir exact : {run.payslips.length} constatations + 1 paiement) — D=C={fcfa(run.grossTotal + run.cnssEmployerTotal + run.netTotal)}</li>
                  <li>Soldes 661x / 6641 / 4311 / 4321 / 4221 / 5211 ramenés à zéro pour cette paie</li>
                  <li>{run.headcount} bulletins marqués ANNULÉ (PDF estampillé, sans valideur comptable)</li>
                  <li>Opération scellée dans la chaîne Evidence (INV-008) + audit PAYROLL_REVERSAL_POSTED</li>
                </ul>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4 accent-primary" />
              J&apos;ai compris les conséquences comptables de cette contre-passation
            </label>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
              <Button size="sm" disabled={!ack} onClick={() => setStep(2)}>Continuer</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-1">
            <div className="grid gap-2">
              <Label>Motif de la contre-passation (≥ 10 caractères — scellé à vie)</Label>
              <textarea
                className="min-h-[64px] rounded-md border bg-transparent px-3 py-2 text-sm"
                placeholder="Ex. : double comptabilisation de la prime de transport — clôture à refaire après correction du personnel"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Confirmation : retapez exactement <span className="font-mono text-foreground">{run.reference}</span></Label>
              <Input value={confirmRef} onChange={(e) => setConfirmRef(e.target.value)} placeholder={run.reference} className="font-mono" />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setStep(1)} disabled={busy}>Retour</Button>
              <Button size="sm" disabled={busy || reason.trim().length < 10 || confirmRef.trim() !== run.reference} onClick={submit}>{busy ? 'Extourne…' : 'Valider et sceller l' + "'" + 'extourne'}</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && result && (
          <div className="space-y-3 py-1">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm space-y-1">
              <p className="flex items-center gap-2 font-medium text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Extourne postée au journal PAIE</p>
              <p className="text-xs text-muted-foreground">{result.item.headcount} bulletin(s) annulé(s) · extourne D=C={fcfa(result.item.reversalTotal)} · {run.reference} → statut REVERSED</p>
              <p className="text-xs text-muted-foreground">Preuve scellée : <span className="font-mono text-foreground">{result.item.evidence.ref}</span> (séquence {result.item.evidence.seq})</p>
            </div>
            <p className="text-xs text-muted-foreground">La paie {run.period} est contre-passée et immuable : les bulletins PDF portent l&apos;estampille ANNULÉ, le run reste historisé pour l&apos;audit. Vous pouvez désormais lancer une <span className="text-foreground">clôture corrigée</span> pour la même période — elle créera un nouveau run (l&apos;ancien, REVERSED, n&apos;est jamais effacé).</p>
            <DialogFooter><Button size="sm" onClick={onClose}>Terminer</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

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
  const [payroll, setPayroll] = useState<PayrollData | null>(null)
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [tab, setTab] = useState('invoices')
  const [error, setError] = useState<ApiFail | null>(null)

  const fail = (e: unknown) => { if (!(e instanceof ApiFail && e.status === 401)) setError(e instanceof ApiFail ? e : new ApiFail(0, 'Erreur inattendue')) }

  const load = useCallback(() => {
    apiJson<{ items?: Invoice[] }>('/api/v1/finance/invoices').then((d) => { setInvoices(d.items ?? []); setError(null) }).catch(fail)
    apiJson<{ items?: Expense[] }>('/api/v1/finance/expenses').then((d) => setExpenses(d.items ?? [])).catch(fail)
    apiJson<JournalData>('/api/v1/finance/journal').then(setJournal).catch(fail)
    apiJson<PayrollData>('/api/v1/finance/payroll').then(setPayroll).catch(fail)
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
          <TabsTrigger value="payroll">Paie</TabsTrigger>
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
          {error ? <LoadError error={error} onRetry={load} /> : !invoices && <Skeleton className="h-72" />}
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

        <TabsContent value="payroll" className="mt-4">
          {error ? <LoadError error={error} onRetry={load} /> : !payroll ? <Skeleton className="h-72" /> : <PayrollPanel data={payroll} onDone={load} />}
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
