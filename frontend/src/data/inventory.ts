import type { Tone } from '../components/ui/Badge'

// Feed types and medications in store. Filled in place from Supabase by remote.ts, so every
// module that imports these arrays sees the farm's records. Stock screens build their ledgers
// and figures from trade.history (see stockMetrics.ts).

/** One day's movements. */
export type Movement = {
  date: string
  received?: number
  used?: number
  /** Count adjustment, signed. */
  adjust?: number
  source: string
}

export type FeedType = {
  name: string
  bags: number
  /** null when the feed isn't in use */
  daysOfCover: number | null
  reorderAt: number
  bagsPerDay: number | null
  note?: string
  ledger: Movement[]
}

export const feedTypes: FeedType[] = []

export type Medication = {
  name: string
  category: string
  batch: string
  expiry: string
  stock: number
  reorderAt: number
  unit: 'g' | 'vials' | 'kg'
  /** null for products with no withdrawal (disinfectants) */
  withdrawalDays: number | null
  inUseBy?: number
}

export const medications: Medication[] = []

/** Stock within this factor of the reorder level counts as "near reorder". */
export const NEAR_REORDER_FACTOR = 1.25

export function medicationStatus(m: Medication): { tone: Tone; label: string } {
  if (m.inUseBy) return { tone: 'info', label: `In use · Pen ${m.inUseBy}` }
  if (m.stock <= m.reorderAt) return { tone: 'warning', label: 'Reorder' }
  if (m.stock <= m.reorderAt * NEAR_REORDER_FACTOR) return { tone: 'neutral', label: 'Near reorder' }
  return { tone: 'success', label: 'OK' }
}
