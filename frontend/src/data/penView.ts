import type { Kpi } from '../components/ui/KpiCard'
import { farmSettings } from './farmSettings'
import { penName } from './farmViews'
import { addDays, daysFrom, dm, feedVariance, kpi, lastDays, layingRate, nairaKpi, penCost, penMoney, period, previous, timeOf, todayISO, weekdayDm, withdrawals } from './metrics'
import type { Catalog, DailyRow, History } from './remote'
import { formatDayMon } from '../lib/format'

// Everything the pen detail screen shows, worked out from the records for one pen.

export type DailyEntry = {
  iso: string
  date: string
  died: number
  diedPct: number | null
  feedBags: number
  feedVsExpected: number | null
  eggs: number | null
  layingRate: number | null
  medication: string | null
  recordedBy: string
  /** Entered on a later day than the record. */
  late: boolean
}

const MODES: Record<string, string> = { water: 'water', feed: 'feed', injection: 'injection', spray: 'spray', eye_nose_drop: 'eye/nose drop' }

export function penEntries(history: History, catalog: Catalog, penId: number, rows: DailyRow[]): DailyEntry[] {
  const meds = new Map(catalog.medications.map((m) => [m.id, m]))
  return rows.map((d) => {
    const given = history.medLines.filter((l) => l.penId === penId && l.date === d.date)
    const enteredOn = d.createdAt ? new Intl.DateTimeFormat('en-CA', { timeZone: farmSettings.timeZone }).format(new Date(d.createdAt)) : d.date
    const late = enteredOn > d.date
    const who = d.recordedBy.split(' ')[0]
    return {
      iso: d.date,
      date: weekdayDm(d.date),
      died: d.mortality,
      diedPct: d.mortalityPct,
      feedBags: d.feedBags,
      feedVsExpected: d.variancePct,
      eggs: d.eggs,
      layingRate: d.layingRate,
      medication: given.length ? given.map((l) => `${meds.get(l.medicationId)?.name ?? '—'} ${l.quantity} ${meds.get(l.medicationId)?.stock_unit ?? ''}`.trim()).join(', ') : null,
      recordedBy: late ? `Late · ${who}, ${dm(enteredOn)} ${timeOf(d.createdAt)}` : `${who} · ${timeOf(d.createdAt)}`,
      late,
    }
  })
}

export const modeLabel = (m: string) => MODES[m] ?? m

/** The pen's current flock (or its most recent one) and its daily rows, oldest first. */
export function penFlock(history: History, penId: number) {
  const flocks = history.flocks.filter((f) => f.pen_id === penId)
  const flock = flocks.find((f) => f.status === 'active') ?? flocks.sort((a, b) => b.placed_on.localeCompare(a.placed_on))[0]
  const rows = flock ? history.daily.filter((d) => d.flockId === flock.id).sort((a, b) => a.date.localeCompare(b.date)) : []
  return { flock, rows }
}

/** Birds alive at the end of a day: the latest closing count on or before it. */
const liveOn = (rows: DailyRow[], placed: number, date: string) => [...rows].reverse().find((d) => d.date <= date)?.closing ?? placed

export function penKpis(history: History, catalog: Catalog, penId: number): Kpi[] {
  const { flock, rows } = penFlock(history, penId)
  if (!flock) return []
  const today = todayISO()
  const weekAgo = addDays(today, -7)
  const spark = lastDays(8)
  const placed = flock.birds_placed
  const live = liveOn(rows, placed, today)
  const liveThen = liveOn(rows, placed, weekAgo)
  const lostPct = (n: number) => ((placed - n) / placed) * 100
  const layers = catalog.pens.find((p) => p.id === penId)?.bird_types?.lays_eggs ?? false
  const last7 = rows.filter((d) => d.date > weekAgo)
  const prev7 = rows.filter((d) => d.date <= weekAgo && d.date > addDays(weekAgo, -7))

  const month = period('month', today)
  const money = (r: { from: string; to: string }) => {
    const m = penMoney(history, catalog, r).find((x) => x.penId === penId)
    return m ? m.revenue - penCost(m) : null
  }
  const margin = money(month)
  const marginPrev = money(previous(month))
  const marginShown = nairaKpi(margin ?? 0)

  const third: Kpi = layers
    ? kpi({
        label: 'Laying rate',
        value: layingRate(last7)?.toFixed(1) ?? '—',
        unit: '%',
        current: layingRate(last7),
        previous: layingRate(prev7),
        points: true,
        digits: 1,
        context: 'Last 7 days vs the 7 before',
        info: 'Eggs collected ÷ hens at the start of the day, for this pen. The change compares the last 7 days with the 7 before.',
        spark: spark.map((d) => rows.find((r) => r.date === d)?.layingRate ?? 0),
      })
    : kpi({
        label: 'Feed vs expected',
        value: feedVariance(last7)?.toFixed(1) ?? '—',
        unit: '%',
        current: feedVariance(last7),
        previous: feedVariance(prev7),
        points: true,
        digits: 1,
        goodWhen: 'neither',
        context: `Last 7 days · tolerance ±${farmSettings.feedVariancePct}%`,
        info: 'Feed used (bags × kg a bag) compared with birds × grams a bird a day for the flock’s age (Settings → Feed & targets).',
        spark: spark.map((d) => rows.find((r) => r.date === d)?.variancePct ?? 0),
      })

  return [
    kpi({
      label: 'Live birds',
      value: live.toLocaleString('en-NG'),
      unit: 'birds',
      current: live,
      previous: liveThen,
      goodWhen: 'neither',
      context: `of ${placed.toLocaleString('en-NG')} placed · vs 7 days ago`,
      info: 'The closing count from this pen’s latest daily entry: birds placed less every death recorded.',
      spark: spark.map((d) => liveOn(rows, placed, d)),
    }),
    kpi({
      label: 'Flock mortality',
      value: lostPct(live).toFixed(1),
      unit: '%',
      current: lostPct(live),
      previous: lostPct(liveThen),
      points: true,
      digits: 1,
      goodWhen: 'down',
      context: `${(placed - live).toLocaleString('en-NG')} birds since placement`,
      info: 'All deaths recorded since the flock was placed ÷ birds placed.',
      spark: spark.map((d) => lostPct(liveOn(rows, placed, d))),
    }),
    third,
    kpi({
      label: 'Margin this month',
      value: margin === null ? '—' : marginShown.value,
      unit: marginShown.unit,
      current: margin,
      previous: marginPrev,
      context: `vs same days of ${previous(month).from.slice(0, 7) === month.from.slice(0, 7) ? 'last period' : new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(`${previous(month).from}T00:00:00Z`))}`,
      info: 'This month’s sales for the pen (plus its share of egg-store sales) − feed, medication, birds, pen expenses and its share of farm costs.',
      spark: spark.map((d) => money({ from: month.from, to: d < month.from ? month.from : d }) ?? 0),
    }),
  ]
}

/** 30 days of deaths, the alert threshold, and a plain-language read of the trend. */
export function mortalitySeries(rows: DailyRow[]) {
  const dates = lastDays(30)
  const byDate = new Map(rows.map((d) => [d.date, d]))
  const birds = dates.map((d) => byDate.get(d)?.mortality ?? 0)
  const opening = dates.map((d) => byDate.get(d)?.opening ?? 0)
  const latestOpening = [...rows].reverse()[0]?.opening ?? 0
  const thresholdBirds = (latestOpening * farmSettings.mortalityAlertPct) / 100

  // Consecutive rises ending today.
  let rising = 0
  for (let i = birds.length - 1; i > 0 && birds[i] > birds[i - 1]; i--) rising++
  const sorted = birds.slice(0, -1).filter((_, i) => byDate.has(dates[i])).sort((a, b) => a - b)
  const typicalMax = sorted.length ? sorted[Math.floor(sorted.length * 0.8)] : 0
  const labels = [0, 7, 14, 21, 29].map((i) => formatDayMon(dates[i]))
  return {
    dates,
    birds,
    opening,
    thresholdBirds,
    thresholdLabel: `Threshold ${farmSettings.mortalityAlertPct}% ≈ ${Math.ceil(thresholdBirds)} birds`,
    risingDays: rising >= 2 ? rising + 1 : 0,
    xLabels: labels,
    typicalMax,
    typical: sorted.length ? `Typical day for this flock: 0–${typicalMax} birds` : 'No entries in the last 30 days',
  }
}

/** Expected grams per bird today, from the feed targets for this bird type and age. */
export function expectedGrams(catalog: Catalog, birdTypeId: number, ageDays: number) {
  const week = Math.floor(ageDays / 7) + 1
  const band = catalog.feedTargets.find((t) => t.bird_type_id === birdTypeId && week >= t.week_from && (t.week_to === null || week <= t.week_to))
  return band ? { grams: Number(band.grams_per_bird_day), feed: catalog.feedTypes.find((f) => f.id === band.recommended_feed_type_id)?.name } : null
}

export function flockFacts(history: History, catalog: Catalog, penId: number) {
  const { flock, rows } = penFlock(history, penId)
  if (!flock) return null
  const today = todayISO()
  const ageDays = (flock.closed_on ? daysFrom(flock.placed_on, flock.closed_on) : daysFrom(flock.placed_on, today)) + flock.age_at_placement_days
  const latest = rows.at(-1)
  const target = expectedGrams(catalog, flock.bird_type_id, ageDays)
  const w = withdrawals(history, catalog, today).find((x) => x.penId === penId)
  const placedAge = flock.age_at_placement_days
  return {
    flock,
    code: flock.code,
    breed: flock.breed ?? '—',
    placed: `${formatDayMon(flock.placed_on)} ${flock.placed_on.slice(0, 4)} · ${placedAge === 0 ? 'day-old' : `${Math.floor(placedAge / 7)} weeks old`}`,
    age: `${Math.floor(ageDays / 7)} weeks ${ageDays % 7} days`,
    week: Math.floor(ageDays / 7) + 1,
    birdsPlaced: flock.birds_placed,
    liveNow: latest?.closing ?? flock.birds_placed,
    feedType: catalog.feedTypes.find((f) => f.id === latest?.feedTypeId)?.name ?? target?.feed ?? '—',
    expectedFeed: target ? `${target.grams} g / bird / day` : 'No feed target set',
    withdrawal: w ? `${w.medication} · clear from ${formatDayMon(w.clearFrom)}` : 'None active',
    title: `${penName(catalog, penId)} · ${catalog.pens.find((p) => p.id === penId)?.bird_types?.lays_eggs ? 'Layers' : 'Broilers'}`,
  }
}

/**
 * Birds a flock has on record now: its latest closing count (or birds placed), less birds sold
 * since that entry, which only reach the count with the next entry. `exceptSaleId` leaves one sale
 * out, for editing it.
 */
export function birdsOnRecord(history: History, flock: History['flocks'][number], exceptSaleId?: number) {
  const rows = history.daily.filter((d) => d.flockId === flock.id)
  const latest = rows.reduce<DailyRow | undefined>((m, d) => (!m || d.date > m.date ? d : m), undefined)
  const lastEntry = latest?.date ?? ''
  const soldSince = history.saleAllocations
    .filter((a) => a.flock_id === flock.id && a.sale_id !== exceptSaleId)
    .filter((a) => {
      const s = history.sales.find((x) => x.id === a.sale_id)
      return s && s.approval !== 'rejected' && s.sold_on >= lastEntry
    })
    .reduce((n, a) => n + Number(a.quantity), 0)
  return Math.max(0, (latest?.closing ?? flock.birds_placed) - soldSince)
}
