import type { Kpi } from '../components/ui/KpiCard'
import { pensToday, type Alert, type PenToday } from './dashboard'
import { pens, type BirdType } from './pens'
import { farm } from './session'
import { feedBands } from './settings'
import { formatSignedPct } from '../lib/format'
import { farmSettings } from './farmSettings'

// Mock data matching P-D6 · Production. Replace with API calls.

export const productionDays = ['2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05'] as const
export type ProductionDay = (typeof productionDays)[number]

export const productionKpis: Kpi[] = [
  {
    label: 'Eggs collected',
    value: '130',
    unit: 'crates',
    delta: '+2 cr',
    trend: 'up',
    sentiment: 'good',
    context: 'vs Wed 07/10',
    info: 'Crates of 30 collected across layer pens',
    spark: [124, 126, 125, 127, 128, 128, 129, 130],
  },
  {
    label: 'Laying rate',
    value: '86.1',
    unit: '%',
    delta: '+0.3 pts',
    trend: 'up',
    sentiment: 'good',
    context: '4 layer pens',
    info: 'Eggs collected ÷ laying hens',
    spark: [84.9, 85.2, 85.0, 85.4, 85.6, 85.8, 85.9, 86.1],
  },
  {
    label: 'Mortality',
    value: '10',
    unit: 'birds',
    delta: '0.13%',
    trend: 'up',
    sentiment: 'bad',
    context: 'Pen 2 rising',
    info: 'Birds that died, all pens',
    spark: [5, 4, 5, 5, 4, 5, 7, 10],
  },
  {
    label: 'Feed used',
    value: '27.1',
    unit: 'bags',
    delta: '+5.0%',
    trend: 'up',
    sentiment: 'bad',
    context: 'vs 25.8 expected',
    info: '25 kg bags used, all pens',
    spark: [25.6, 25.5, 25.7, 25.6, 25.6, 25.8, 26.3, 27.1],
  },
]

export type PenEntry = {
  penId: number
  initials: string
  name: string
  /** Flock code, plus any status such as a medication withdrawal. */
  flock: string
  ageWeeks: number
  opening: number
  /** null when the entry is missing */
  entry: {
    died: number
    /** Highlight a rising mortality trend in this pen. */
    diedFlag?: boolean
    feedBags: number
    feedVsExpected: number
    /** Total eggs; null for broiler pens. */
    eggs: number | null
    layingRate: number | null
    recordedBy: string
    time: string
  } | null
}

export const penEntries: PenEntry[] = [
  { penId: 1, initials: 'P1', name: 'Pen 1 · Layers', flock: 'L-2511', ageWeeks: 58, opening: 1021, entry: { died: 1, feedBags: 4.7, feedVsExpected: 2.4, eggs: 800, layingRate: 78.4, recordedBy: 'Chidi', time: '06:40' } },
  { penId: 2, initials: 'P2', name: 'Pen 2 · Layers', flock: 'L-2602', ageWeeks: 31, opening: 1120, entry: { died: 3, diedFlag: true, feedBags: 5.1, feedVsExpected: 1.4, eggs: 1012, layingRate: 91.4, recordedBy: 'Kemi', time: '06:55' } },
  { penId: 3, initials: 'P3', name: 'Pen 3 · Layers', flock: 'L-2540 · withdrawal', ageWeeks: 34, opening: 1206, entry: { died: 1, feedBags: 5.4, feedVsExpected: -1.8, eggs: 1084, layingRate: 89.9, recordedBy: 'Musa', time: '06:58' } },
  { penId: 4, initials: 'P4', name: 'Pen 4 · Layers', flock: 'L-2604', ageWeeks: 21, opening: 1183, entry: { died: 3, feedBags: 5.0, feedVsExpected: -7.6, eggs: 1005, layingRate: 85.0, recordedBy: 'Musa', time: '07:05' } },
  { penId: 5, initials: 'P5', name: 'Pen 5 · Broilers', flock: 'B-2636', ageWeeks: 5, opening: 1850, entry: null },
  { penId: 6, initials: 'P6', name: 'Pen 6 · Broilers', flock: 'B-2639', ageWeeks: 3, opening: 1264, entry: { died: 2, feedBags: 6.9, feedVsExpected: 14.0, eggs: null, layingRate: null, recordedBy: 'Tunde', time: '06:51' } },
]

export const missingEntry = {
  penId: 5,
  staff: 'Musa',
  lateUntil: 'Sat 10 Oct',
}

export const productionTotals = {
  feedVsExpected: 5.0,
  layingRate: 86.1,
}

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

/** Alerts raised by entries saved this session (FR-PRD-4, BO3). */
export function entryAlerts(records: ProductionRecord[]): Alert[] {
  return records.flatMap((r) => {
    const pct = (r.died / r.opening) * 100
    const out: Alert[] = []
    if (pct > farmSettings.mortalityAlertPct)
      out.push({ id: `m-${r.penId}-${r.date}`, kind: 'mortality', tone: 'danger', title: `Mortality spike — Pen ${r.penId}`, detail: `${r.died} birds (${pct.toFixed(1)}%) today · threshold ${farmSettings.mortalityAlertPct}% · Emeka notified`, time: r.time, to: `/pens/${r.penId}` })
    if (Math.abs(r.feedVsExpected) > farmSettings.feedVariancePct)
      out.push({ id: `f-${r.penId}-${r.date}`, kind: 'feed', tone: 'warning', title: `Feed ${formatSignedPct(r.feedVsExpected)} vs expected — Pen ${r.penId}`, detail: `${Math.round(r.feedBags * BAG_KG)} kg used vs ${Math.round(r.expectedKg)} kg expected for ${r.closing.toLocaleString('en-NG')} birds`, time: r.time, to: `/pens/${r.penId}` })
    return out
  })
}
