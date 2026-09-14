import type { Metadata } from 'next'
import { Mail, Phone, Clock, MapPin } from 'lucide-react'
import { VitrineShell } from '@/components/vitrine/shell'
import { ContactForm } from '@/components/vitrine/contact-form'
import { BUREAUX } from '@/lib/vitrine/content'

export const metadata: Metadata = {
  title: 'Contacts — YAHRIA BUSINESS OS',
  description:
    'Parlons de votre projet : démonstration, souscription, support, partenariats. Bureaux à Abidjan, Dakar et Cotonou — réponse sous 48 h ouvrées.',
}

export default function ContactsPage() {
  return (
    <VitrineShell>
      <section className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="text-[11px] font-bold tracking-widest text-primary">CONTACTS</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight max-w-3xl">
            Parlons de votre entreprise
          </h1>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Démonstration, souscription, intégration ou simple question : notre équipe
            répond sous 48 heures ouvrées. Pour aller plus vite, la plateforme est ouverte
            avec des comptes de démonstration — sans engagement.
          </p>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-4 py-12 grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Formulaire */}
          <div>
            <h2 className="text-lg font-bold tracking-tight">Envoyer un message</h2>
            <p className="mt-1.5 text-xs text-muted-foreground mb-5">
              Les champs marqués * sont obligatoires.
            </p>
            <ContactForm />
          </div>

          {/* Coordonnées */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" /> Email & téléphone
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-primary shrink-0" /> contact@yahria.business
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-primary shrink-0" /> +225 27 20 00 00 00
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" /> Lun – Ven · 8h – 18h GMT
                </li>
              </ul>
            </div>

            {BUREAUX.map((b) => (
              <div key={b.ville} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> {b.ville}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">{b.pays}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{b.adresse}</p>
                <p className="text-xs text-muted-foreground mt-1">{b.tel}</p>
              </div>
            ))}

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
              <h3 className="text-sm font-bold">Plus rapide : la démo en libre accès</h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Dix comptes de démonstration couvrent les six rôles et les trois pays.
                Le mot de passe est affiché sur la page de connexion.
              </p>
              <a
                href="/login"
                className="mt-4 inline-flex items-center justify-center w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Accéder à la plateforme
              </a>
            </div>
          </aside>
        </div>
      </section>
    </VitrineShell>
  )
}
