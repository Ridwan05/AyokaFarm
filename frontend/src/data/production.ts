import { accessOf } from '../lib/access'
import { pensToday, type PenToday } from './dashboard'
import { farmSettings } from './farmSettings'
import { pens, type BirdType } from './pens'
import type { Catalog, DailyRow, History } from './remote'
import { farm, farmTodayISO, type User } from './session'
import { feedBands } from './settings'

// ── Daily entry (P-M · pen attendant) ──────────────────────────────

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/** Bag weight when a feed type doesn't say (the database uses the same fallback). */
export const BAG_KG = 25

/** Kg in a bag of this feed (feed_types.bag_kg). */
export const bagKgOf = (catalog: Catalog, feedName: string) => Number(catalog.feedTypes.find((f) => f.name === feedName)?.bag_kg ?? BAG_KG) || BAG_KG

/**
 * Expected feed for a flock on a day, chosen the way the production_daily view does: the flock's
 * bird type, its breed's band before a general one, and the band covering its week of age.
 */
export function feedTargetFor(catalog: Catalog, flock: { bird_type_id: number; breed: string | null }, week: number) {
  return (
    catalog.feedTargets
      .filter((t) => t.bird_type_id === flock.bird_type_id && (t.breed === null || t.breed === flock.breed) && week >= t.week_from && (t.week_to === null || week <= t.week_to))
      .sort((a, b) => Number(a.breed === null) - Number(b.breed === null) || b.week_from - a.week_from)[0] ?? null
  )
}

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
  /** Note for the farm manager or vet. */
  notes?: string
}

export const todayISO = () => {
  const d = farm.today
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** What a pen's entry for today starts from: its flock, age, and the birds left after the last entry. */
export function entryContext(penId: number, catalog?: Catalog, history?: History) {
  const pen = pens.find((p) => p.id === penId)
  const today = pensToday.find((p) => p.id === penId)
  if (!pen || !today) return null
  const flock = history?.flocks.find((f) => f.pen_id === penId && f.status === 'active')
  // Age today from the flock's placement (as the database counts it); week 1 is days 0–6.
  const ageDays = flock ? daysBetween(flock.placed_on, farmTodayISO()) + flock.age_at_placement_days : (pen.ageDays ?? pen.week * 7 - 3)
  const week = Math.floor(ageDays / 7) + 1
  const target = catalog && flock ? feedTargetFor(catalog, flock, week) : null
  // No targets set up for this bird type: fall back to the built-in bands.
  const bands = feedBands[pen.type === 'Layers' ? 'Layers · Isa Brown' : 'Broilers · Ross 308']
  const band = bands.find((b) => week >= b.from && (b.to === null || week <= b.to)) ?? bands[bands.length - 1]
  const recommended = target?.recommended_feed_type_id ? catalog?.feedTypes.find((f) => f.id === target.recommended_feed_type_id)?.name : undefined
  return {
    pen,
    type: pen.type as BirdType,
    ageDays,
    /** Birds at the start of today: yesterday's closing count. */
    opening: today.died === null ? today.birds : today.birds + today.died,
    gramsPerBird: target ? Number(target.grams_per_bird_day) : band.grams,
    feedType: recommended ?? band.feed,
    /** Already recorded today in the mock data (before this session). */
    recordedAt: today.died === null ? null : today.entry.label.replace('Recorded ', ''),
  }
}

export const formatAge = (days: number) => `${Math.floor(days / 7)} wk ${days % 7} d`

// ── Correcting a saved entry ────────────────────────────────────────

const MODE_LABEL: Record<string, MedicationLine['mode']> = { water: 'Water', feed: 'Feed', injection: 'Injection', spray: 'Spray', eye_nose_drop: 'Eye/nose drop' }
const PURPOSE_LABEL: Record<string, MedicationLine['purpose']> = { treatment: 'Treatment', prevention: 'Prevention', vaccination: 'Vaccination', vitamin: 'Vitamin' }

/** A saved entry as form values: counts, feed, eggs as crates + loose, and its medication lines. */
export function savedEntry(history: History, catalog: Catalog, recordId: number) {
  const row = history.daily.find((d) => d.id === recordId)
  if (!row) return null
  const perCrate = farmSettings.eggsPerCrate
  return {
    row,
    feedType: catalog.feedTypes.find((f) => f.id === row.feedTypeId)?.name ?? null,
    crates: row.eggs === null ? '' : String(Math.floor(row.eggs / perCrate)),
    pieces: row.eggs === null ? '' : String(row.eggs % perCrate),
    cracked: row.cracked === null ? '' : String(row.cracked),
    meds: history.medLines
      .filter((l) => l.penId === row.penId && l.date === row.date)
      .map((l) => ({
        medication: catalog.medications.find((m) => m.id === l.medicationId)?.name ?? '',
        qty: String(l.quantity),
        mode: MODE_LABEL[l.mode] ?? 'Water',
        purpose: PURPOSE_LABEL[l.purpose] ?? 'Treatment',
      })),
  }
}

/** The farm day an entry was first saved on. */
const savedOn = (row: DailyRow) => (row.createdAt ? farmTodayISO(new Date(row.createdAt)) : row.date)

/**
 * Who may correct a saved entry (same rule as the database's edit window): the owner and farm
 * manager always; whoever recorded it, within the edit window (the same day by default).
 */
export function canCorrectEntry(user: User, row: DailyRow) {
  if (user.role === 'owner' || user.role === 'farm-manager') return true
  if (accessOf(user, 'production', 'edit') === 'none' || row.recordedBy !== user.name) return false
  const days = Math.round((Date.parse(farmTodayISO()) - Date.parse(savedOn(row))) / 86_400_000)
  return days <= farmSettings.editWindowDays
}

/** Deleting an entry needs production delete permission (the owner by default). */
export const canDeleteEntry = (user: User) => accessOf(user, 'production', 'delete') !== 'none'

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
