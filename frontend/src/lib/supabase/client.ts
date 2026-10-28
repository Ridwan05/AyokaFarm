import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

/** Supabase client for the browser. Row-level security decides what each signed-in person can read and write. */
export function createClient() {
  return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
}
