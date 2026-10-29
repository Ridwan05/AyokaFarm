import { pensToday, type PenToday } from './dashboard'
import { pens, type BirdType } from './pens'
import { farm } from './session'
import { feedBands } from './settings'

// ── Daily entry (P-M · pen attendant) ──────────────────────────────

export const BAG_KG = 25

export const MEDICATION_MODES = ['Water', 'Feed', 'Injection', 'Spray', 'Eye/nose drop'] as const
export const MEDICATION_PURPOSES = ['Treatment', 'Prevention', 'Vaccination', 'Vitamin'] as const

export type MedicationLine = {
  medication: string
  qty: number
  mode: (typeof MEDICATION_MODES)[number]
  purpose: (typeof MEDICATION_PURPOSES)[number]
}

/** One pen's record for one day. Everything except the typed counts is calculated. */
export type ProductionRecord = {
  penId: number
  date: string
  time: string
  opening: number
  died: number
  closing: number
  feedType: string
  feedBags: number
  expectedKg: number
  /** Signed % of actual vs expected feed. */
  feedVsExpected: number
  /** Total eggs, cracked included; null for broiler pens. */
  eggs: number | null
  cracked: number | null
  layingRate: number | null
  medications: MedicationLine[]
  recordedBy: string
}

export const todayISO = () => {
  const d = farm.today
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** What a pen's entry for today starts from: its flock, age, and the birds left after the last entry. */
export function entryContext(penId: number) {
  const pen = pens.find((p) => p.id === penId)
  const today = pensToday.find((p) => p.id === penId)
  if (!pen || !today) return null
  // Mock: today is day 4 of the flock's current week.
  const ageDays = pen.ageDays ?? pen.week * 7 - 3
  const bands = feedBands[pen.type === 'Layers' ? 'Layers · Isa Brown' : 'Broilers · Ross 308']
  const band = bands.find((b) => pen.week >= b.from && (b.to === null || pen.week <= b.to)) ?? bands[bands.length - 1]
  return {
    pen,
    type: pen.type as BirdType,
    ageDays,
    /** Birds at the start of today: yesterday's closing count. */
    opening: today.died === null ? today.birds : today.birds + today.died,
    gramsPerBird: band.grams,
    feedType: band.feed,
    /** Already recorded today in the mock data (before this session). */
    recordedAt: today.died === null ? null : today.entry.label.replace('Recorded ', ''),
  }
}

export const formatAge = (days: number) => `${Math.floor(days / 7)} wk ${days % 7} d`

/** Today's row for a pen, with any entry saved this session filled in. */
export function withTodaysRecord(p: PenToday, records: ProductionRecord[]): PenToday {
  const r = records.find((x) => x.penId === p.id && x.date === todayISO())
  if (!r) return p
  return {
    ...p,
    birds: r.closing,
    died: r.died,
    feedVsExpected: r.feedVsExpected,
    layingRate: r.layingRate,
    entry: { tone: 'success', label: `Recorded ${r.time}` },
  }
}
