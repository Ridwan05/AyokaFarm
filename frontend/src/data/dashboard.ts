import type { Tone } from '../components/ui/Badge'
import type { AlertKind, AlertTone } from '../features/alerts/AlertRow'

// Shapes shared by the dashboard and production screens. The figures are calculated from
// the farm's records (metrics.ts); pensToday is filled in place when the records load (remote.ts).

export type Alert = {
  id: string
  kind: AlertKind
  tone: AlertTone
  title: string
  detail: string
  time: string
  to: string
}

/** Days of cover that fill the bar. */
export const FEED_COVER_FULL_DAYS = 15

export type PenToday = {
  id: number
  initials: string
  name: string
  flock: string
  birds: number
  /** null = not recorded yet */
  died: number | null
  feedVsExpected: number | null
  layingRate: number | null
  entry: { tone: Tone; label: string }
}

/** Pens with a flock and today's entry, if any. Filled from Supabase. */
export const pensToday: PenToday[] = []
