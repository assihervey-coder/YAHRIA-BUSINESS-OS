import { NextRequest, NextResponse } from 'next/server'

// YAHRIA BUSINESS OS V1 — Middleware d'accès (INV-002 Authorization)
// Vérification légère de présence du cookie de session (edge-safe) ;
// la validation complète (session en base + RBAC + RLS) est faite par
// withAuth() dans chaque route API.

const PUBLIC_PATHS = ['/login', '/api/v1/auth']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) || pathname.startsWith('/api/v1/auth')) {
    return NextResponse.next()
  }

  const hasSession = req.cookies.has('yahria_session')
  if (!hasSession) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('from', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|woff2?)$).*)'],
}
