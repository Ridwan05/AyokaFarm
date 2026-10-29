'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import type { Database } from '../lib/supabase/database.types'

// "Ask to reorder" requests (reorder_requests): the store keeper asks, whoever buys marks them
// ordered or dismisses them. Loaded by the screens that show them, not with the farm's records.

export type ReorderRequest = Database['public']['Tables']['reorder_requests']['Row']
type NewRequest = Database['public']['Tables']['reorder_requests']['Insert']

const friendly = (message: string) =>
  /does not exist|schema cache/i.test(message)
    ? 'Reorder requests aren’t set up yet (run the latest database migration).'
    : /row-level security|permission denied|42501/i.test(message)
      ? 'You don’t have permission to do that.'
      : message.replace(/^.*?ERROR:\s*/, '')

/** Open requests (newest first), with ask / mark ordered / dismiss. */
export function useReorderRequests() {
  const db = useMemo(() => createClient(), [])
  const [open, setOpen] = useState<ReorderRequest[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error: e } = await db.from('reorder_requests').select('*').eq('status', 'open').order('created_at', { ascending: false }).range(0, 199)
    if (e) setError(friendly(e.message))
    else {
      setOpen(data ?? [])
      setError(null)
    }
  }, [db])

  useEffect(() => {
    // Loading from Supabase (an external system) on open, so setting state here is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  /** Mark a request ordered or dismissed. Resolves to an error message, or null when it saved. */
  const decide = useCallback(
    async (id: number, status: 'ordered' | 'dismissed'): Promise<string | null> => {
      const { data, error: e } = await db.from('reorder_requests').update({ status }).eq('id', id).select('id')
      if (e) return friendly(e.message)
      // A refused update changes no rows and returns no error.
      if (!data?.length) return 'You can’t change this request (only whoever buys can).'
      await reload()
      return null
    },
    [db, reload],
  )

  return { open, error, reload, decide }
}

/** Save a new request. Resolves to an error message, or null when it saved. */
export async function askToReorder(request: NewRequest): Promise<string | null> {
  const { error } = await createClient().from('reorder_requests').insert(request)
  return error ? friendly(error.message) : null
}
