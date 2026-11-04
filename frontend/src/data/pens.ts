import type { Tone } from '../components/ui/Badge'

// Pens and flocks. The pens array is filled in place when the records load (remote.ts).

/** What a pen keeps: egg layers or meat birds. */
export type BirdType = 'Layers' | 'Broilers'

/** One of the three figures on a pen card. */
export type Stat = {
  label: string
  /** null renders an em dash */
  value: string | null
  tone?: 'default' | 'warning' | 'danger'
  /** How the value is calculated (info icon). */
  info?: string
}

/** A pen card on the Pens screen. */
export type Pen = {
  id: number
  /** The owner can rename a pen; show this, not the number. */
  name: string
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
  /** Days since hatch, from the flock's placement date (set when loaded from Supabase). */
  ageDays?: number
}

/** Every active pen with its flock and today’s figures. Filled from Supabase (remote.ts). */
export const pens: Pen[] = []

/** Kinds of flock a pen can be stocked with. */
export type FlockKind = 'Broilers' | 'Layers' | 'Point-of-lay'
