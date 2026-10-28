import type { NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Everything except Next's static files and images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-mark.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
