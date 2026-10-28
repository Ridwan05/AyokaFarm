import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'

/**
 * Refreshes the Supabase session on every request and sends signed-out visitors to /login.
 * This is a convenience redirect only — row-level security is what actually protects the data.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Don't run code between createServerClient and getClaims(): it refreshes the token.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const onLogin = request.nextUrl.pathname === '/login'

  if (!signedIn && !onLogin) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = request.nextUrl.pathname === '/' ? '' : `?next=${encodeURIComponent(request.nextUrl.pathname)}`
    return copyCookies(response, NextResponse.redirect(url))
  }
  if (signedIn && onLogin) {
    return copyCookies(response, NextResponse.redirect(new URL('/', request.url)))
  }
  return response
}

/** A redirect must carry any refreshed session cookies too. */
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c))
  return to
}
