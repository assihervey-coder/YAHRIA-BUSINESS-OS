'use client'

// YAHRIA BUSINESS OS V1 — 00_CORE view (customers, suppliers, employees, products)
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge, SectionTitle, LoadError, fcfa, fmt, fmtDate } from './ui'
import { apiJson, ApiFail, isAuthLoss, toApiFail } from '@/lib/yahria/client-api'
import { useToast } from '@/hooks/use-toast'
import { Plus, Archive, Search } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

type Row = Record<string, string | number | null>

function CreateDialog({ entity, onDone }: { entity: string; onDone: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setV = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const fields: Record<string, { label: string; key: string; placeholder?: string; type?: string }[]> = {
    customers: [
      { label: 'Nom / Raison sociale', key: 'name', placeholder: 'Ex : Sahel Commerce SARL' },
      { label: 'Segment', key: 'segment', placeholder: 'SME | CORP | NGO | GOV | RETAIL' },
      { label: 'Ville', key: 'city', placeholder: 'Abidjan' },
      { label: 'Email', key: 'email', type: 'email', placeholder: 'contact@…' },
      { label: 'Téléphone', key: 'phone', placeholder: '+225 …' },
    ],
    suppliers: [
      { label: 'Nom', key: 'name', placeholder: 'Ex : TransAgence Nord' },
      { label: 'Catégorie', key: 'category', placeholder: 'LOGISTICS | SUPPLIES | SERVICES | TELECOM | UTILITIES' },
      { label: 'Ville', key: 'city', placeholder: 'Abidjan' },
      { label: 'Email', key: 'email', type: 'email' },
      { label: 'Téléphone', key: 'phone' },
    ],
    employees: [
      { label: 'Nom complet', key: 'name', placeholder: 'Ex : Kader Ouédraogo' },
      { label: 'Poste', key: 'position', placeholder: 'Ex : Commercial' },
      { label: 'Département', key: 'department', placeholder: 'DIRECTION | FINANCE | OPS | COMMERCIAL | IT' },
      { label: 'Type de contrat', key: 'contractType', placeholder: 'CDI | CDD | STAGE | CONSULTANT' },
      { label: 'Salaire brut (FCFA)', key: 'grossSalary', type: 'number', placeholder: '450000' },
    ],
    products: [
      { label: 'Désignation', key: 'name', placeholder: 'Ex : Riz parfumé 25kg' },
      { label: 'Type', key: 'type', placeholder: 'PRODUCT | SERVICE' },
      { label: 'Unité', key: 'unit', placeholder: 'sac / carton / course' },
      { label: 'Prix unitaire HT (FCFA)', key: 'unitPrice', type: 'number', placeholder: '18500' },
      { label: 'Stock (produits)', key: 'stock', type: 'number', placeholder: '100' },
    ],
  }

  async function submit() {
    setBusy(true)
    const res = await fetch(`/api/v1/core/${entity}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, grossSalary: Number(form.grossSalary) || undefined, unitPrice: Number(form.unitPrice) || undefined, stock: Number(form.stock) || undefined }),
    })
    setBusy(false)
    if (res.ok) {
      toast({ title: 'Entité créée', description: `Ajoutée au ${entity} — écriture d'audit enregistrée.` })
      setOpen(false); setForm({}); onDone()
    } else {
      const e = await res.json().catch(() => ({}))
      toast({ title: 'Erreur', description: e.error ?? 'Création impossible', variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nouveau</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Créer — {entity}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          {fields[entity].map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input id={f.key} type={f.type ?? 'text'} placeholder={f.placeholder} value={form[f.key] ?? ''} onChange={set(f.key)} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>{busy ? 'Création…' : 'Créer (audité)'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DataTable({ entity, cols, refreshKey }: { entity: string; cols: { key: string; label: string; fmt?: (v: unknown) => string }[]; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<ApiFail | null>(null)

  const load = useCallback(() => {
    apiJson<{ items?: Row[] }>(`/api/v1/core/${entity}`)
      .then((d) => { setRows(d.items ?? []); setError(null) })
      .catch((e: unknown) => { if (!isAuthLoss(e)) setError(toApiFail(e)) })
  }, [entity])

  useEffect(load, [load, refreshKey])

  async function archive(id: string) {
    const res = await fetch(`/api/v1/core/${entity}/${id}`, { method: 'DELETE' })
    if (res.ok) { setRows((r) => (r ?? []).filter((x) => x.id !== id)) }
    else {
      const e = await res.json().catch(() => ({}))
      alert(e.error ?? 'Archivage refusé')
    }
  }

  if (error) return <div className="space-y-2"><LoadError error={error} onRetry={load} /></div>
  if (!rows) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
  const filtered = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  const statusOf = (r: Row) => (typeof r.status === 'string' ? r.status : null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="pl-8 h-8 text-sm" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} élément(s)</span>
      </div>
      <div className="rounded-lg border overflow-hidden max-h-[26rem] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              {cols.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
              <TableHead className="w-16">Statut</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={String(r.id)}>
                {cols.map((c) => (
                  <TableCell key={c.key} className="text-sm max-w-[220px] truncate">
                    {c.fmt ? c.fmt(r[c.key]) : String(r[c.key] ?? '—')}
                  </TableCell>
                ))}
                <TableCell>{statusOf(r) && statusOf(r) !== 'ACTIVE' ? <StatusBadge status={statusOf(r)!} /> : <StatusBadge status="ACTIVE" />}</TableCell>
                <TableCell>
                  {statusOf(r) === 'ACTIVE' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Archiver" onClick={() => archive(String(r.id))}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function CoreView() {
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)

  return (
    <div className="space-y-4">
      <SectionTitle
        title="CORE — noyau opérationnel"
        desc="Organisations, tiers, personnes, produits — tout objet métier porte tenant_id, org, statut, version et références audit/evidence (invariant §2)."
      />
      <Tabs defaultValue="customers">
        <TabsList className="flex-wrap">
          <TabsTrigger value="customers">Clients</TabsTrigger>
          <TabsTrigger value="suppliers">Fournisseurs</TabsTrigger>
          <TabsTrigger value="employees">Employés</TabsTrigger>
          <TabsTrigger value="products">Produits & Services</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-4">
          <Card><CardContent className="pt-5 space-y-3">
            <div className="flex justify-end"><CreateDialog entity="customers" onDone={bump} /></div>
            <DataTable entity="customers" refreshKey={refreshKey} cols={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Nom' },
              { key: 'segment', label: 'Segment' },
              { key: 'city', label: 'Ville' },
              { key: 'riskScore', label: 'Risque', fmt: (v) => `${v}/100` },
            ]} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4">
          <Card><CardContent className="pt-5 space-y-3">
            <div className="flex justify-end"><CreateDialog entity="suppliers" onDone={bump} /></div>
            <DataTable entity="suppliers" refreshKey={refreshKey} cols={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Nom' },
              { key: 'category', label: 'Catégorie' },
              { key: 'city', label: 'Ville' },
              { key: 'performance', label: 'Perf.', fmt: (v) => `${v}/100` },
            ]} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="employees" className="mt-4">
          <Card><CardContent className="pt-5 space-y-3">
            <div className="flex justify-end"><CreateDialog entity="employees" onDone={bump} /></div>
            <DataTable entity="employees" refreshKey={refreshKey} cols={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Nom' },
              { key: 'position', label: 'Poste' },
              { key: 'department', label: 'Dépt.' },
              { key: 'contractType', label: 'Contrat' },
              { key: 'grossSalary', label: 'Salaire brut', fmt: (v) => fcfa(Number(v)) },
              { key: 'hiredAt', label: 'Embauche', fmt: (v) => fmtDate(String(v)) },
            ]} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card><CardContent className="pt-5 space-y-3">
            <div className="flex justify-end"><CreateDialog entity="products" onDone={bump} /></div>
            <DataTable entity="products" refreshKey={refreshKey} cols={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Désignation' },
              { key: 'type', label: 'Type' },
              { key: 'unit', label: 'Unité' },
              { key: 'unitPrice', label: 'PU HT', fmt: (v) => fcfa(Number(v)) },
              { key: 'stock', label: 'Stock', fmt: (v) => (v == null ? '—' : fmt(Number(v))) },
            ]} />
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
