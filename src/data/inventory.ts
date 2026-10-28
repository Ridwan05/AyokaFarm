import type { Tone } from '../components/ui/Badge'
import type { Kpi } from '../components/ui/KpiCard'

// Mock data matching P-D4 / P-D8 / P-D26 (and the Store Keeper feed variants).

/** One day's movements. Opening and closing are calculated by `withBalances`. */
export type Movement = {
  date: string
  received?: number
  used?: number
  /** Count adjustment, signed. */
  adjust?: number
  source: string
}

export type Balanced<T> = T & { opening: number; closing: number }

/**
 * Walks back from today's closing stock to fill in each day's opening and closing:
 * closing = opening + received − used ± adjust.
 */
export function withBalances<T extends Movement>(closing: number, rows: T[], delta = (r: T) => (r.received ?? 0) - (r.used ?? 0) + (r.adjust ?? 0)): Balanced<T>[] {
  let close = closing
  return rows.map((r) => {
    const opening = close - delta(r)
    const row = { ...r, opening, closing: close }
    close = opening
    return row
  })
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

const week = ['Fri 09/10', 'Thu 08/10', 'Wed 07/10', 'Tue 06/10', 'Mon 05/10', 'Sun 04/10', 'Sat 03/10']

export const feedTypes: FeedType[] = [
  {
    name: 'Layer mash', bags: 82, daysOfCover: 4, reorderAt: 100, bagsPerDay: 21,
    ledger: [
      { date: week[0], used: 21, source: '4 pen entries · Pen 4 pending upload' },
      { date: week[1], used: 21, source: '4 pen entries' },
      { date: week[2], used: 20, adjust: -1, source: 'Count by Bayo: 1 bag torn and unusable' },
      { date: week[3], received: 100, used: 20, source: 'Delivery · Greenfield Feeds · PF-0418' },
      { date: week[4], used: 20, source: '4 pen entries' },
      { date: week[5], used: 21, source: '4 pen entries' },
      { date: week[6], used: 20, source: '4 pen entries' },
    ],
  },
  {
    name: 'Broiler finisher', bags: 96, daysOfCover: 8, reorderAt: 60, bagsPerDay: 12,
    ledger: week.map((date, i) => ({ date, used: 12, source: i === 1 ? 'Pen 5 · entered late on Fri' : 'Pen 5 entry' })),
  },
  {
    name: 'Broiler starter', bags: 84, daysOfCover: 14, reorderAt: 30, bagsPerDay: 6,
    ledger: week.map((date) => ({ date, used: 6, source: 'Pen 6 entry' })),
  },
  {
    name: 'Grower mash', bags: 62, daysOfCover: null, reorderAt: 40, bagsPerDay: null, note: 'Next grower flock: 20 Nov',
    ledger: week.map((date) => ({ date, source: 'Not in use' })),
  },
]

export const LOW_COVER_DAYS = 5

export const reorderSuggestion = {
  feed: 'Layer mash',
  bags: 100,
  days: 5,
  supplier: 'Greenfield Feeds',
  lastPrice: 18500,
  lastDate: '06 Oct',
}

export const medicationKpis: Kpi[] = [
  { label: 'Medications', value: '7', unit: 'in stock', delta: 'No change', trend: 'flat', sentiment: 'neutral', context: '1 near reorder', info: 'Medication products with stock', spark: [7, 7, 7, 7, 7, 7, 7] },
  { label: 'Expiring in 30 days', value: '0', unit: 'batches', delta: 'None', trend: 'up', sentiment: 'good', context: 'next on 03 Dec', info: 'Batches that expire in the next 30 days', spark: [84.9, 85.2, 85.0, 85.4, 85.8, 86.0, 86.2, 86.4] },
  { label: 'Withdrawals in force', value: '1', unit: 'pen', delta: 'Pen 3', trend: 'flat', sentiment: 'neutral', context: 'eggs held to 12 Oct', info: 'Pens whose eggs and birds cannot be sold yet', spark: [1, 1, 1, 1, 1, 1, 1] },
  { label: 'Spent this month', value: '85', unit: 'thousand ₦', delta: '+12%', trend: 'flat', sentiment: 'neutral', context: 'vs September', info: 'Medication purchases this month', spark: [85, 85, 85, 85, 85, 85, 85] },
]

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

export const medications: Medication[] = [
  { name: 'Vitalyte (Vitamin C)', category: 'Vitamin', batch: 'VT-2207', expiry: '03/2027', stock: 1450, reorderAt: 500, unit: 'g', withdrawalDays: 0 },
  { name: 'Amoxicillin 20%', category: 'Antibiotic', batch: 'AX-2209', expiry: '08/2027', stock: 400, reorderAt: 200, unit: 'g', withdrawalDays: 5, inUseBy: 3 },
  { name: 'Amprolium 20%', category: 'Coccidiostat', batch: 'AP-2105', expiry: '11/2026', stock: 300, reorderAt: 250, unit: 'g', withdrawalDays: 7 },
  { name: 'Gumboro (IBD) vaccine', category: 'Vaccine', batch: 'GB-1003', expiry: '03/12/2026', stock: 3, reorderAt: 2, unit: 'vials', withdrawalDays: 0 },
  { name: 'Lasota (ND) vaccine', category: 'Vaccine', batch: 'LS-2108', expiry: '02/2027', stock: 4, reorderAt: 2, unit: 'vials', withdrawalDays: 0 },
  { name: 'Piperazine', category: 'Dewormer', batch: 'PZ-2201', expiry: '01/2027', stock: 800, reorderAt: 300, unit: 'g', withdrawalDays: 7 },
  { name: 'Virkon S', category: 'Disinfectant', batch: 'VK-2203', expiry: '06/2027', stock: 4, reorderAt: 2, unit: 'kg', withdrawalDays: null },
]

/** Stock within this factor of the reorder level counts as "near reorder". */
export const NEAR_REORDER_FACTOR = 1.25

export function medicationStatus(m: Medication): { tone: Tone; label: string } {
  if (m.inUseBy) return { tone: 'info', label: `In use · Pen ${m.inUseBy}` }
  if (m.stock <= m.reorderAt) return { tone: 'warning', label: 'Reorder' }
  if (m.stock <= m.reorderAt * NEAR_REORDER_FACTOR) return { tone: 'neutral', label: 'Near reorder' }
  return { tone: 'success', label: 'OK' }
}

export const withdrawal = {
  pen: 3,
  medication: 'Amoxicillin 20%',
  given: '05–07 Oct',
  days: 5,
  until: 'Mon 12 Oct',
  heldCrates: 179,
}

export const eggKpis: Kpi[] = [
  { label: 'Sellable now', value: '172', unit: 'crates', delta: '+51 vs yesterday', trend: 'up', sentiment: 'good', context: 'after 40 sold today', info: 'Crates in store that can be sold', spark: [150, 152, 151, 155, 160, 163, 168, 172] },
  { label: 'Held · withdrawal', value: '179', unit: 'crates', delta: 'Pen 3', trend: 'flat', sentiment: 'neutral', context: 'until Mon 12 Oct', info: 'Crates kept apart during a withdrawal period', spark: [179, 179, 179, 179, 179, 179, 179] },
  { label: 'Collected today', value: '130', unit: 'crates', delta: '+18 eggs', trend: 'up', sentiment: 'good', context: '4 layer pens · 86.4% laying', info: 'Crates collected from pen entries today', spark: [124, 126, 125, 127, 128, 128, 129, 130] },
  { label: 'Sold this week', value: '612', unit: 'crates', delta: '+18 cr', trend: 'flat', sentiment: 'neutral', context: 'avg ₦4,150 a crate', info: 'Crates sold since Monday', spark: [600, 600, 601, 600, 602, 604, 608, 612] },
]

export type EggMovement = Movement & { collected: number; sold: number; broken: number; held: number | null }

export const eggStore = {
  closing: 172,
  ledger: [
    { date: week[0], collected: 94, sold: 40, broken: 3, held: 36, source: '4 pen entries · sales' },
    { date: week[1], collected: 94, sold: 65, broken: 5, held: 36, source: '4 pen entries · sales' },
    { date: week[2], collected: 95, sold: 60, broken: 3, held: 35, source: '4 pen entries · sales' },
    { date: week[3], collected: 96, sold: 120, broken: 2, held: 36, source: '4 pen entries · sales' },
    { date: week[4], collected: 97, sold: 84, broken: 2, held: 36, source: 'Pen 3 withdrawal starts' },
    { date: week[5], collected: 134, sold: 124, broken: 2, held: null, source: '4 pen entries · sales' },
    { date: week[6], collected: 133, sold: 119, broken: 2, held: null, source: 'Count: 2 crates broken' },
  ] satisfies EggMovement[],
}

/** Egg store: closing = opening + collected − sold − broken (held crates are kept apart). */
export const eggDelta = (r: EggMovement) => r.collected - r.sold - r.broken
