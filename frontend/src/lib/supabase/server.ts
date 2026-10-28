import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

/** Supabase client for server code, acting as the signed-in person (their cookies). */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component; the proxy refreshes sessions, so this is safe to ignore.
        }
      },
    },
  })
}

/**
 * Admin client using the secret key — bypasses RLS. Only for server actions that have already
 * checked the caller's role (e.g. the owner adding staff). Never import this into client code.
 */
export function createSecretClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not set on the server')
  return createAdminClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
