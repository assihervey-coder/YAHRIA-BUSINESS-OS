'use client'

// Formulaire de contact du site vitrine → POST /api/v1/contact
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, CheckCircle2, AlertTriangle } from 'lucide-react'
import { SUJETS_CONTACT } from '@/lib/vitrine/content'

const inputCls =
  'mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50'

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [subject, setSubject] = useState(SUJETS_CONTACT[0])
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, subject, message, website }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Envoi impossible — réessayez')
        setBusy(false)
        return
      }
      setSent(true)
    } catch {
      setError('Serveur injoignable — réessayez')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
        <h3 className="mt-4 text-lg font-bold">Message envoyé</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Merci {name.split(' ')[0]} — notre équipe vous répond sous 48 h ouvrées.
          Pour une démonstration immédiate, connectez-vous à la plateforme avec un compte de démonstration.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a href="/login" className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            Accéder à la plateforme
          </a>
          <button
            type="button"
            onClick={() => { setSent(false); setName(''); setEmail(''); setCompany(''); setMessage('') }}
            className="h-10 px-5 rounded-lg border border-border text-sm font-medium hover:bg-accent/60 transition-colors"
          >
            Envoyer un autre message
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-6 space-y-4" noValidate>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ct-name" className="text-xs font-medium text-muted-foreground">Nom complet *</label>
          <Input id="ct-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Awa Koné" className={inputCls} />
        </div>
        <div>
          <label htmlFor="ct-email" className="text-xs font-medium text-muted-foreground">Email professionnel *</label>
          <Input id="ct-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="awa@entreprise.ci" className={inputCls} />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ct-company" className="text-xs font-medium text-muted-foreground">Entreprise</label>
          <Input id="ct-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ivoire Distribution SARL" className={inputCls} />
        </div>
        <div>
          <label htmlFor="ct-subject" className="text-xs font-medium text-muted-foreground">Sujet *</label>
          <select id="ct-subject" required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls}>
            {SUJETS_CONTACT.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="ct-message" className="text-xs font-medium text-muted-foreground">Message *</label>
        <textarea
          id="ct-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Décrivez votre besoin : effectif, secteur, pays, modules souhaités…"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 resize-y min-h-[120px]"
        />
      </div>
      {/* Honeypot anti-spam — invisible pour les humains */}
      <div className="hidden" aria-hidden>
        <label htmlFor="ct-website">Website</label>
        <input id="ct-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {error && (
        <p className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full h-11 gap-2 font-semibold">
        <Send className="h-4 w-4" /> {busy ? 'Envoi…' : 'Envoyer le message'}
      </Button>
      <p className="text-[10px] text-muted-foreground text-center">
        Vos données sont stockées uniquement pour traiter votre demande — jamais revendues.
      </p>
    </form>
  )
}
