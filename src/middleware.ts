import { NextRequest, NextResponse } from 'next/server'

// YAHRIA BUSINESS OS V1 — Middleware d'accès (INV-002 Authorization)
// Site vitrine : public (10 pages, racine /).
// Plateforme applicative : /app — session obligatoire (cookie présence, edge-safe) ;
// la validation complète (session en base + RBAC + RLS + mur 2FA) est faite par
// withAuth() dans chaque route API.
// API métier : /api/* hors whitelist → 401 JSON sans session.

const PUBLIC_API_PREFIXES = ['/api/v1/auth', '/api/v1/contact']

// INV-013 : TOUTE réponse API porte la version du contrat public — y compris
// celles du middleware (401 avant l'entrée dans la route).
function contractHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-API-Version', '1.1.0') // synchronisé avec src/lib/yahria/contracts.ts (API_CONTRACT)
  res.headers.set('X-Contract-Id', 'YBOS-API')
  return res
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── APIs publiques (auth, contact vitrine) ──
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // ── API métier : session requise ──
  if (pathname.startsWith('/api/')) {
    if (!req.cookies.has('yahria_session')) {
      return contractHeaders(NextResponse.json({ error: 'Authentification requise' }, { status: 401 }))
    }
    return NextResponse.next()
  }

  // ── Plateforme /app : redirection vers l'authentification ──
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    if (!req.cookies.has('yahria_session')) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('from', pathname)
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // ── Site vitrine : public ──
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|woff2?)$).*)'],
}
