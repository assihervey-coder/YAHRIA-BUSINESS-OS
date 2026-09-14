// YAHRIA BUSINESS OS V1 — API publique du formulaire de contact (site vitrine)
// POST /api/v1/contact — sans authentification (page publique /contacts).
// Honeypot « website » : un robot qui remplit le champ est ignoré silencieusement.
import { NextRequest, NextResponse } from 'next/server'
import { dbUnscoped } from '@/lib/db'
import { API_CONTRACT } from '@/lib/yahria/contracts'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  // Honeypot anti-spam : champ invisible rempli → réponse OK factice, rien stocké
  if (String(body.website ?? '').trim() !== '') {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const company = String(body.company ?? '').trim() || null
  const subject = String(body.subject ?? '').trim()
  const message = String(body.message ?? '').trim()

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: 'Nom requis (2 à 120 caractères)' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 })
  }
  if (!subject || subject.length > 120) {
    return NextResponse.json({ error: 'Sujet requis' }, { status: 400 })
  }
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json({ error: 'Message requis (10 à 5000 caractères)' }, { status: 400 })
  }

  const row = await dbUnscoped.contactMessage.create({
    data: { name, email, company, subject, message },
  })

  const res = NextResponse.json({ ok: true, id: row.id })
  res.headers.set('X-API-Version', API_CONTRACT.version)
  res.headers.set('X-Contract-Id', API_CONTRACT.contractId)
  return res
}

export function GET() {
  return NextResponse.json({ error: 'Méthode non supportée — utilisez POST' }, { status: 405 })
}
