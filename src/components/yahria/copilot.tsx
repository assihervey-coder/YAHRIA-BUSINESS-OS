'use client'

// YAHRIA BUSINESS OS V1 — 04_AI : Executive Intelligence / Copilot (spec §10)
// QUESTION → BUSINESS CONTEXT → GRAPH → FINANCE → REASONING → ANSWER → EVIDENCE
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SectionTitle, fmtDateTime } from './ui'
import { SendHorizonal, BrainCircuit, FileCheck2, Loader2, Sparkles, AlertTriangle, TrendingDown, PiggyBank, Landmark } from 'lucide-react'

interface Msg { role: 'user' | 'assistant'; content: string; evidence?: string; model?: string; ts?: string }

const SUGGESTIONS = [
  { icon: Landmark, text: 'Quelle est la situation financière de l\'entreprise ?' },
  { icon: AlertTriangle, text: 'Quels clients présentent un risque de non-paiement ?' },
  { icon: TrendingDown, text: 'Y a-t-il une tension de trésorerie prévisible à 30 jours ?' },
  { icon: PiggyBank, text: 'Combien de TVA devrai-je déclarer et quand ?' },
  { icon: Sparkles, text: 'Que dois-je prioriser cette semaine ?' },
]

export function CopilotView() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sources, setSources] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  async function ask(question: string) {
    if (!question.trim() || busy) return
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((ms) => [...ms, { role: 'user', content: question, ts: new Date().toISOString() }])
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/v1/ai/copilot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })
      const d = await res.json()
      setMessages((ms) => [...ms, { role: 'assistant', content: d.answer ?? d.error ?? 'Erreur', evidence: d.evidenceRef, model: d.model, ts: new Date().toISOString() }])
      if (d.sources) setSources(d.sources)
    } catch {
      setMessages((ms) => [...ms, { role: 'assistant', content: 'Le Copilot est momentanément indisponible (échec contrôlé, sans impact sur les données).' }])
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4 flex flex-col">
      <SectionTitle
        title="Executive Intelligence — Copilot YAHRIA"
        desc="Le Copilot raisonne sur le Business Graph, FINANCE et MONEY — jamais sur ses seuls paramètres. Chaque réponse produit une Evidence (INV-008) et reste en lecture seule (INV-AI-001)."
      />

      <Card className="flex-1 min-h-[26rem] flex flex-col">
        <CardContent className="pt-4 flex-1 flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0 max-h-[calc(100vh-22rem)]">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center py-8">
                <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center"><BrainCircuit className="h-6 w-6 text-primary" /></div>
                <div>
                  <p className="font-medium">Copilot de direction</p>
                  <p className="text-sm text-muted-foreground max-w-md">Posez vos questions métier. Les données réelles de votre organisation (trésorerie, créances, retards, agents) sont injectées comme contexte tracé.</p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
                {m.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5"><BrainCircuit className="h-4 w-4 text-primary" /></div>
                )}
                <div className={`rounded-xl px-3.5 py-2.5 max-w-[85%] md:max-w-[75%] text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary/20 border border-primary/25' : 'bg-accent/40 border border-border'}`}>
                  {m.content}
                  {m.evidence && (
                    <div className="mt-2 pt-1.5 border-t border-border/60 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <FileCheck2 className="h-3 w-3" /> Evidence {m.evidence} · modèle {m.model} · {m.ts ? fmtDateTime(m.ts) : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-2.5 items-center text-sm text-muted-foreground">
                <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center"><Loader2 className="h-4 w-4 text-primary animate-spin" /></div>
                <span className="italic">Agrégation du contexte (Graph → Finance → Money) puis raisonnement…</span>
              </div>
            )}
          </div>

          <div className="pt-3 mt-2 border-t">
            <div className="flex flex-wrap gap-1.5 pb-2.5">
              {SUGGESTIONS.map((s) => (
                <button key={s.text} onClick={() => ask(s.text)} disabled={busy}
                  className="text-[11px] px-2.5 py-1 rounded-full border text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50">
                  <s.icon className="h-3 w-3" /> {s.text}
                </button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); ask(input) }} className="flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ex : Quelle est la situation financière de l'entreprise ?" disabled={busy} />
              <Button type="submit" size="icon" disabled={busy || !input.trim()}><SendHorizonal className="h-4 w-4" /></Button>
            </form>
            {sources.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                {sources.map((s) => <Badge key={s} variant="outline" className="text-[10px] text-muted-foreground">{s}</Badge>)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
