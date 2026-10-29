'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import type { AlertMark } from './alerts'
import type { Catalog } from './remote'

// Acknowledged / resolved alerts, shared by everyone (alert_marks). Loaded when the Alerts screen
// opens rather than with the farm's records, since only that screen needs them.

const firstName = (catalog: Catalog, id: string) => catalog.profiles.find((p) => p.id === id)?.full_name.split(' ')[0] ?? 'Someone'

export function useAlertMarks(catalog: Catalog, userId: string) {
  const db = useMemo(() => createClient(), [])
  const [marks, setMarks] = useState<Record<string, AlertMark>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error: e } = await db.from('alert_marks').select('*').order('marked_at', { ascending: false }).range(0, 999)
    if (e) {
      setError(/does not exist|schema cache/i.test(e.message) ? 'Shared alert status isn’t set up yet (run the latest database migration).' : e.message)
    } else {
      setMarks(Object.fromEntries((data ?? []).map((m) => [m.alert_id, { status: m.status as AlertMark['status'], by: firstName(catalog, m.marked_by), at: m.marked_at, note: m.note ?? undefined }])))
      setError(null)
    }
    setLoaded(true)
  }, [db, catalog])

  useEffect(() => {
    // Loading from Supabase (an external system) on open, so setting state here is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  /** Save a mark for everyone. Resolves to an error message, or null when it saved. */
  const mark = useCallback(
    async (alertId: string, status: AlertMark['status'], note?: string): Promise<string | null> => {
      const { data, error: e } = await db
        .from('alert_marks')
        // Whoever marks it last owns the mark (the database checks it's the person signed in).
        .upsert({ alert_id: alertId, status, note: note ?? null, marked_by: userId, marked_at: new Date().toISOString() }, { onConflict: 'alert_id' })
        .select('alert_id')
      if (e) return /row-level security|permission denied|42501/i.test(e.message) ? 'You don’t have permission to change alerts.' : e.message.replace(/^.*?ERROR:\s*/, '')
      if (!data?.length) return 'The alert status wasn’t saved.'
      await reload()
      return null
    },
    [db, reload, userId],
  )

  return { marks, loaded, error, mark }
}
