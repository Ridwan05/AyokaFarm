import type { Kpi } from '../components/ui/KpiCard'

// Mock report data matching P-D17 (a–e). Totals and margins are calculated in the pages.

const good = [84.9, 85.2, 85.0, 85.4, 85.8, 86.0, 86.2, 86.4]
const bad = [0.08, 0.07, 0.08, 0.08, 0.07, 0.08, 0.12, 0.17]
const flat = [1, 1, 1, 1, 1, 1, 1]

// ── Profit & loss (September, layers) ───────────────────────────────

export const plKpis: Kpi[] = [
  { label: 'Layer revenue', value: '13.9', unit: 'million ₦', delta: '+5.1%', trend: 'up', sentiment: 'good', context: 'vs August', info: 'Egg and spent-layer sales from layer pens', spark: good },
  { label: 'Layer costs', value: '12.74', unit: 'million ₦', delta: '+3.2%', trend: 'flat', sentiment: 'neutral', context: 'feed is 87%', info: 'Feed and medication used, bird cost and shared overhead', spark: flat },
  { label: 'Layer margin', value: '1.16', unit: 'million ₦', delta: '8.3%', trend: 'up', sentiment: 'good', context: 'of revenue', info: 'Revenue minus costs', spark: good },
  { label: 'Broilers in progress', value: '2', unit: 'flocks', delta: '₦3.6M spent', trend: 'flat', sentiment: 'neutral', context: 'margin when sold', info: 'Broiler flocks not yet sold', spark: flat },
]

export type PenPL = { pen: number; flock: string; weeks: string; revenue: number; feed: number; medication: number; birdCost: number; overhead: number }

/** ₦ millions */
export const penPL: PenPL[] = [
  { pen: 2, flock: 'L-2602', weeks: 'week 26–30', revenue: 4.12, feed: 2.78, medication: 0.04, birdCost: 0.18, overhead: 0.19 },
  { pen: 3, flock: 'L-2540', weeks: 'week 29–33', revenue: 4.38, feed: 3.02, medication: 0.06, birdCost: 0.18, overhead: 0.2 },
  { pen: 1, flock: 'L-2511', weeks: 'week 53–57', revenue: 3.3, feed: 2.7, medication: 0.03, birdCost: 0.15, overhead: 0.17 },
  { pen: 4, flock: 'L-2604', weeks: 'week 17–21', revenue: 2.1, feed: 2.62, medication: 0.05, birdCost: 0.18, overhead: 0.19 },
]

export const unitCosts = { costPerCrate: 3760, sellingPrice: 4100, feedPerCrateKg: 4.5, feedCostPerBird: 2450 }
export const plNote = 'Pen 4 started laying in week 19 and should turn positive in November as laying passes 85%.'
export const broilerNote = {
  title: 'Broiler flocks are judged per flock, not per month',
  body: 'Pen 5 (B-2636) and Pen 6 (B-2639) haven’t sold yet: ₦2.14M and ₦1.46M spent so far. Their margin appears when each flock is sold.',
}

// ── Daily production (30 days) ──────────────────────────────────────

export const productionReportKpis: Kpi[] = [
  { label: 'Eggs collected', value: '3,812', unit: 'crates', delta: '+3.4%', trend: 'up', sentiment: 'good', context: 'vs previous 30 days', info: 'Crates collected across layer pens', spark: good },
  { label: 'Laying rate', value: '85.6', unit: '%', delta: '+1.1 pts', trend: 'up', sentiment: 'good', context: '4 layer pens, average', info: 'Average daily laying rate', spark: good },
  { label: 'Mortality', value: '162', unit: 'birds', delta: '2.1%', trend: 'up', sentiment: 'bad', context: 'highest: Pens 2 and 6', info: 'Birds lost over the period', spark: bad },
  { label: 'Entries on time', value: '176', unit: 'of 180', delta: '97.8%', trend: 'up', sentiment: 'good', context: '3 late · 1 missing', info: 'Pen-day entries recorded on the day', spark: good },
]

export type PenProduction = {
  pen: number
  type: 'Layers' | 'Broilers'
  flock: string
  weeks: string
  recorded: number
  days: number
  crates: number | null
  layingOrWeight: string
  died: number
  mortalityPct: number
  feedBags: number
  vsExpected: number
  late: number
  /** Highlight a pen whose losses are above normal */
  flag?: boolean
}

export const penProduction: PenProduction[] = [
  { pen: 1, type: 'Layers', flock: 'L-2511', weeks: 'weeks 54–58', recorded: 30, days: 30, crates: 796, layingOrWeight: '78.9%', died: 19, mortalityPct: 1.8, feedBags: 141, vsExpected: 1.6, late: 1 },
  { pen: 2, type: 'Layers', flock: 'L-2602', weeks: 'weeks 27–31', recorded: 30, days: 30, crates: 1003, layingOrWeight: '91.1%', died: 31, mortalityPct: 2.7, feedBags: 153, vsExpected: 0.9, late: 1, flag: true },
  { pen: 3, type: 'Layers', flock: 'L-2540', weeks: 'weeks 30–34', recorded: 30, days: 30, crates: 1082, layingOrWeight: '90.2%', died: 14, mortalityPct: 1.2, feedBags: 161, vsExpected: -1.2, late: 0 },
  { pen: 4, type: 'Layers', flock: 'L-2604', weeks: 'weeks 18–22', recorded: 30, days: 30, crates: 931, layingOrWeight: '79.4%', died: 22, mortalityPct: 1.8, feedBags: 149, vsExpected: -6.8, late: 0 },
  { pen: 5, type: 'Broilers', flock: 'B-2636', weeks: 'weeks 1–5', recorded: 29, days: 30, crates: null, layingOrWeight: '1.62 kg', died: 38, mortalityPct: 2.0, feedBags: 235, vsExpected: 2.1, late: 0 },
  { pen: 6, type: 'Broilers', flock: 'B-2639', weeks: 'since 18 Sep', recorded: 21, days: 21, crates: null, layingOrWeight: '0.78 kg', died: 38, mortalityPct: 2.9, feedBags: 75, vsExpected: 5.4, late: 1, flag: true },
]

// 30 days of farm laying rate vs breed standard (deterministic).
const farmNoise = [0, 0.3, 0.1, 0.4, 0.5, 0.2, 0.5, 0.7, 0.6, 0.3, 0.8, 0.8, 0.7, 1.0, 0.9, 0.8, 1.1, 1.0, 0.9, 1.2, 1.1, 1.2, 1.4, 1.3, 1.2, 1.5, 1.4, 1.3, 1.1, 1.2]
export const layingSeries = {
  farm: farmNoise.map((n) => +(84.9 + n).toFixed(1)),
  standard: Array.from({ length: 30 }, (_, i) => +(87.7 - (i * 0.2) / 29).toFixed(2)),
  xLabels: ['9 Sep', '16 Sep', '23 Sep', '30 Sep', '8 Oct'],
  yTicks: [80, 84, 88, 92],
  note: 'The gap to standard comes from Pen 1 (week 58, past its peak) and Pen 4 (week 22, still rising). Pens 2 and 3 are at or above standard.',
}

// ── Feed ledger (30 days) ──────────────────────────────────────────

export const feedReportKpis: Kpi[] = [
  { label: 'Feed used', value: '914', unit: 'bags', delta: '₦16.9M', trend: 'flat', sentiment: 'neutral', context: 'all types, 30 days', info: 'Bags of feed used from pen entries', spark: flat },
  { label: 'Average cost', value: '18,500', unit: '₦ a bag', delta: '+1.9%', trend: 'up', sentiment: 'bad', context: 'weighted average', info: 'Weighted average cost of feed in store', spark: bad },
  { label: 'Farm variance', value: '+1.2', unit: '%', delta: 'within ±10%', trend: 'up', sentiment: 'good', context: 'used vs expected', info: 'Feed used vs expected, all pens', spark: good },
  { label: 'Lowest cover', value: '4', unit: 'days', delta: 'Layer mash', trend: 'up', sentiment: 'bad', context: 'reorder suggested', info: 'Feed type with the fewest days of cover', spark: bad },
]

export const feedVariance = [
  { pen: 1, pct: 1.6 },
  { pen: 2, pct: 0.9 },
  { pen: 3, pct: -1.2 },
  { pen: 4, pct: -6.8 },
  { pen: 5, pct: 2.1 },
  { pen: 6, pct: 5.4 },
]
export const FEED_TOLERANCE_PCT = 10
/** Variance beyond this is shown amber even inside tolerance. */
export const FEED_WATCH_PCT = 5
export const feedVarianceNote = 'Pen 6 is drifting up (+14% yesterday); Pen 4 eats less than its band while it comes into lay.'

export type FeedTypeLedger = {
  name: string
  opening: number
  received: number
  used: number
  adjusted: number
  /** Weighted average ₦ per bag */
  avgCost: number
  dailyUse: number | null
  cover: number | null
}

export const feedTypeLedger: FeedTypeLedger[] = [
  { name: 'Layer mash', opening: 467, received: 220, used: 604, adjusted: -1, avgCost: 18180, dailyUse: 21, cover: 4 },
  { name: 'Broiler finisher', opening: 183, received: 80, used: 167, adjusted: 0, avgCost: 18900, dailyUse: 12, cover: 8 },
  { name: 'Broiler starter', opening: 149, received: 60, used: 125, adjusted: 0, avgCost: 19400, dailyUse: 6, cover: 14 },
  { name: 'Grower mash', opening: 62, received: 0, used: 0, adjusted: 0, avgCost: 17800, dailyUse: null, cover: null },
  { name: 'Chick mash', opening: 18, received: 0, used: 18, adjusted: 0, avgCost: 18900, dailyUse: null, cover: null },
]
export const ALL_FEED_AVG = 18500

// ── Medication ledger (30 days) ────────────────────────────────────

export const medicationReportKpis: Kpi[] = [
  { label: 'Medication used', value: '93.2', unit: 'thousand ₦', delta: '30 days', trend: 'flat', sentiment: 'neutral', context: 'added to pen costs', info: 'Cost of medication used in pens', spark: flat },
  { label: 'Treatments', value: '10', unit: 'given', delta: '4 pens', trend: 'flat', sentiment: 'neutral', context: 'Pens 2, 3, 4 and 6', info: 'Doses recorded in pen entries', spark: flat },
  { label: 'Written off', value: '1', unit: 'vial', delta: '₦7,000', trend: 'up', sentiment: 'bad', context: 'cracked in delivery', info: 'Stock written off after a count', spark: bad },
  { label: 'Withdrawals in force', value: '1', unit: 'pen', delta: 'Pen 3', trend: 'flat', sentiment: 'neutral', context: 'until Mon 12 Oct', info: 'Pens whose eggs and birds cannot be sold yet', spark: flat },
]

export type MedMovement = {
  date: string
  medication: string
  batch: string
  pen: number | null
  kind: 'Used' | 'Received' | 'Written off'
  /** Signed quantity */
  qty: number
  unit: 'g' | 'vials'
  /** ₦ cost charged to the pen (Used only) */
  cost: number
  note: string | null
  by: string
}

/** Newest first. Batch balances are walked back from today's stock (inventory.ts). */
export const medMovements: MedMovement[] = [
  { date: '09/10', medication: 'Vitalyte (Vitamin C)', batch: 'VT-2207', pen: 4, kind: 'Used', qty: -50, unit: 'g', cost: 600, note: null, by: 'Musa' },
  { date: '07/10', medication: 'Vitalyte (Vitamin C)', batch: 'VT-2207', pen: 2, kind: 'Used', qty: -50, unit: 'g', cost: 600, note: null, by: 'Kemi' },
  { date: '07/10', medication: 'Amoxicillin 20%', batch: 'AX-2209', pen: 3, kind: 'Used', qty: -200, unit: 'g', cost: 17000, note: 'Withdrawal to Mon 12 Oct', by: 'Musa' },
  { date: '06/10', medication: 'Amoxicillin 20%', batch: 'AX-2209', pen: 3, kind: 'Used', qty: -200, unit: 'g', cost: 17000, note: 'Withdrawal to Sun 11 Oct', by: 'Musa' },
  { date: '06/10', medication: 'Gumboro (IBD) vaccine', batch: 'GB-1003', pen: 6, kind: 'Used', qty: -2, unit: 'vials', cost: 14000, note: null, by: 'Tunde' },
  { date: '05/10', medication: 'Amoxicillin 20%', batch: 'AX-2209', pen: 3, kind: 'Used', qty: -200, unit: 'g', cost: 17000, note: 'Withdrawal to Sat 10 Oct', by: 'Musa' },
  { date: '03/10', medication: 'Gumboro (IBD) vaccine', batch: 'GB-1003', pen: null, kind: 'Written off', qty: -1, unit: 'vials', cost: 0, note: 'Cracked in delivery · ₦7,000', by: 'Bayo' },
  { date: '02/10', medication: 'Amoxicillin 20%', batch: 'AX-2209', pen: null, kind: 'Received', qty: 1000, unit: 'g', cost: 0, note: 'PM-0112 · VetCare', by: 'Bayo' },
  { date: '28/09', medication: 'Piperazine', batch: 'PZ-2201', pen: 2, kind: 'Used', qty: -50, unit: 'g', cost: 1500, note: '7-day withdrawal, ended 05/10', by: 'Kemi' },
  { date: '28/09', medication: 'Piperazine', batch: 'PZ-2201', pen: 4, kind: 'Used', qty: -50, unit: 'g', cost: 1500, note: '7-day withdrawal, ended 05/10', by: 'Musa' },
  { date: '25/09', medication: 'Amprolium 20%', batch: 'AP-2105', pen: 6, kind: 'Used', qty: -600, unit: 'g', cost: 21600, note: '7-day withdrawal, ended 02/10', by: 'Tunde' },
  { date: '25/09', medication: 'Vitalyte (Vitamin C)', batch: 'VT-2207', pen: 6, kind: 'Used', qty: -200, unit: 'g', cost: 2400, note: null, by: 'Tunde' },
]

export const withdrawalTracker = { pen: 3, medication: 'Amoxicillin 20%', lastDose: 'Wed 07/10', days: 5, day: 2, clearFrom: 'Mon 12 Oct' }
