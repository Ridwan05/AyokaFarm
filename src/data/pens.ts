import type { Tone } from '../components/ui/Badge'

// Mock data matching P-D7 · Pens & flocks and P-D2 · Pen 2. Replace with API calls.

export type BirdType = 'Layers' | 'Broilers'

export type Stat = {
  label: string
  /** null renders an em dash */
  value: string | null
  tone?: 'default' | 'warning' | 'danger'
}

export type Pen = {
  id: number
  type: BirdType
  flock: string
  week: number
  breed: string
  liveBirds: number
  capacity: number
  status: { tone: Tone; label: string }
  /** Lower = shown first when sorting by "needs attention". */
  attention: number
  stats: [Stat, Stat, Stat]
  footer: string
  staff: string
}

export const pens: Pen[] = [
  {
    id: 2, type: 'Layers', flock: 'L-2602', week: 31, breed: 'Isa Brown', liveBirds: 1108, capacity: 1250,
    status: { tone: 'danger', label: 'Mortality alert' }, attention: 1,
    stats: [{ label: 'Laying', value: '90.1%' }, { label: 'Died today', value: '9', tone: 'danger' }, { label: 'Feed vs exp.', value: '+3.1%' }],
    footer: 'Today recorded by Kemi · 07:12', staff: 'Kemi',
  },
  {
    id: 5, type: 'Broilers', flock: 'B-2636', week: 5, breed: 'Ross 308', liveBirds: 1850, capacity: 2000,
    status: { tone: 'danger', label: 'Late entry' }, attention: 2,
    stats: [{ label: 'Avg weight', value: '1.62 kg' }, { label: 'Died today', value: null }, { label: 'Feed vs exp.', value: null }],
    footer: 'Yesterday’s entry missing · Musa', staff: 'Musa',
  },
  {
    id: 6, type: 'Broilers', flock: 'B-2639', week: 3, breed: 'Ross 308', liveBirds: 1262, capacity: 2000,
    status: { tone: 'warning', label: 'Feed +14%' }, attention: 3,
    stats: [{ label: 'Avg weight', value: '0.78 kg' }, { label: 'Died today', value: '1' }, { label: 'Feed vs exp.', value: '+14.0%', tone: 'warning' }],
    footer: 'Today recorded by Tunde · 06:51', staff: 'Tunde',
  },
  {
    id: 3, type: 'Layers', flock: 'L-2540', week: 34, breed: 'Isa Brown', liveBirds: 1204, capacity: 1250,
    status: { tone: 'info', label: 'Withdrawal to 12 Oct' }, attention: 4,
    stats: [{ label: 'Laying', value: '89.7%' }, { label: 'Died today', value: '1' }, { label: 'Feed vs exp.', value: '−4.0%' }],
    footer: 'Today recorded by Musa · 06:58', staff: 'Musa',
  },
  {
    id: 4, type: 'Layers', flock: 'L-2604', week: 22, breed: 'Isa Brown', liveBirds: 1180, capacity: 1250,
    status: { tone: 'neutral', label: 'Due by 18:00' }, attention: 5,
    stats: [{ label: 'Laying (Thu)', value: '85.0%' }, { label: 'Died today', value: null }, { label: 'Feed vs exp.', value: null }],
    footer: 'Not uploaded yet today · Musa', staff: 'Musa',
  },
  {
    id: 1, type: 'Layers', flock: 'L-2511', week: 58, breed: 'Isa Brown', liveBirds: 1020, capacity: 1200,
    status: { tone: 'success', label: 'On track' }, attention: 6,
    stats: [{ label: 'Laying', value: '78.4%' }, { label: 'Died today', value: '0' }, { label: 'Feed vs exp.', value: '+2.0%' }],
    footer: 'Today recorded by Chidi · 06:40', staff: 'Chidi',
  },
]

export type ClosedFlock = {
  code: string
  initials: string
  type: BirdType
  pen: number
  breed: string
  placed: string
  closed: string
  birdsIn: number
  birdsOut: number
  mortalityPct: number
  /** Feed conversion ratio; layers don't have one. */
  fcr: number | null
  margin: number
}

export const closedFlocks: ClosedFlock[] = [
  { code: 'B-2627', initials: 'B7', type: 'Broilers', pen: 5, breed: 'Ross 308', placed: '03 Jul 2026', closed: '21 Aug 2026', birdsIn: 1980, birdsOut: 1902, mortalityPct: 3.9, fcr: 1.68, margin: 1420000 },
  { code: 'B-2618', initials: 'B6', type: 'Broilers', pen: 6, breed: 'Ross 308', placed: '15 Jun 2026', closed: '01 Aug 2026', birdsIn: 1950, birdsOut: 1861, mortalityPct: 4.6, fcr: 1.74, margin: 1180000 },
  { code: 'L-2401', initials: 'L4', type: 'Layers', pen: 2, breed: 'Isa Brown', placed: '12 Jan 2025', closed: '28 Feb 2026', birdsIn: 1200, birdsOut: 1032, mortalityPct: 14.0, fcr: null, margin: 6850000 },
]

export type Staff = { name: string; short: string; pens: number[] }

export const attendants: Staff[] = [
  { name: 'Chidi Okeke', short: 'Chidi', pens: [1] },
  { name: 'Kemi Adewale', short: 'Kemi', pens: [2] },
  { name: 'Musa Ibrahim', short: 'Musa', pens: [3, 4, 5] },
  { name: 'Tunde Bakare', short: 'Tunde', pens: [6] },
]

export const emptyPens = [{ id: 7, capacity: 1500, attendant: 'Chidi' }]

export type FlockKind = 'Broilers' | 'Layers' | 'Point-of-lay'

export const birdPurchases = [
  { code: 'PB-0032', supplier: 'Oyo Hatcheries', birds: 1500, age: 'day-old', cost: 1275000, arrives: '2026-10-12' },
]

export const flockDefaults: Record<FlockKind, { nextCode: string; feedPlan: string; day1Grams: number; breed: string }> = {
  Broilers: { nextCode: 'B-2642', feedPlan: 'Broiler starter from day 1', day1Grams: 20, breed: 'Ross 308' },
  Layers: { nextCode: 'L-2605', feedPlan: 'Chick mash from day 1', day1Grams: 10, breed: 'Isa Brown' },
  'Point-of-lay': { nextCode: 'L-2605', feedPlan: 'Layer mash from day 1', day1Grams: 110, breed: 'Isa Brown' },
}
