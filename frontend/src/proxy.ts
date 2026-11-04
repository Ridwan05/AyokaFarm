import type { NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/proxy'

/** Next.js proxy (formerly middleware): keeps the Supabase session fresh and sends signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

/** Which requests the proxy runs on. */
export const config = {
  // Everything except Next's static files and images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-mark.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
