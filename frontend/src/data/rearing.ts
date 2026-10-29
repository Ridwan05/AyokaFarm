import { farmSettings } from './farmSettings'
import { addDays, daysFrom, inRange, penMoney, sum, todayISO } from './metrics'
import type { Catalog, History } from './remote'

// What it cost to raise a flock to point of lay, and how the P&L can spread that cost over the
// laying weeks instead of showing it in the months it was spent. Uses penMoney() so the figures
// match Costs & profit and the P&L.

type Flock = History['flocks'][number]

const laysEggs = (catalog: Catalog, flock: Flock) => catalog.birdTypes.find((b) => b.id === flock.bird_type_id)?.lays_eggs ?? false
const minDate = (a: string, b: string) => (a < b ? a : b)
const maxDate = (a: string, b: string) => (a > b ? a : b)

export type Rearing = {
  from: string
  /** Last day counted (the day before lay starts, or today / closing while still rearing). */
  to: string
  layer: boolean
  /** Rearing is over: the flock has a start of lay (layers) or is closed (broilers). */
  done: boolean
  layingSince: string | null
  /** No start of lay saved yet; the first day with eggs is used until someone confirms it. */
  provisional: boolean
  /** Week of age at the end of the period. */
  week: number
  birds: number
  feed: number
  medication: number
  penExpenses: number
  overhead: number
  total: number
  feedBags: number
  feedKg: number
  doses: number
  /** Birds on the first laying day (layers) or at the end of the period. */
  hens: number | null
  perHen: number | null
}

/** Cost of a flock from placement to point of lay (layers) or to date / closing (broilers). */
export function rearingCost(history: History, catalog: Catalog, flock: Flock, today = todayISO()): Rearing {
  const layer = laysEggs(catalog, flock)
  const suggested = layer && !flock.laying_started_on ? suggestedLayStart(history, flock) : null
  const layingSince = layer ? (flock.laying_started_on ?? suggested) : null
  const end = flock.closed_on ?? today
  const to = layingSince ? addDays(layingSince, -1) : end
  const from = flock.placed_on
  const m = to >= from ? penMoney(history, catalog, { from, to }).find((x) => x.penId === flock.pen_id) : undefined
  // The flock's own bird purchases, whenever they were dated (often a few days before placement).
  const birds = sum(history.purchases.filter((p) => p.kind === 'birds' && p.flock_id === flock.id), (p) => Number(p.total ?? p.quantity * p.unit_price))
  const rows = history.daily.filter((d) => d.flockId === flock.id && d.date >= from && d.date <= to)
  const doses = history.medLines.filter((l) => l.penId === flock.pen_id && inRange(l.date, { from, to })).length
  const total = birds + (m ? m.feed + m.medication + m.direct + m.overhead : 0)
  const firstLaying = layingSince ? history.daily.find((d) => d.flockId === flock.id && d.date === layingSince) : undefined
  const lastRow = [...rows].sort((a, b) => b.date.localeCompare(a.date))[0]
  const hens = firstLaying?.opening ?? (layingSince ? null : (lastRow?.closing ?? null))
  return {
    from,
    to,
    layer,
    done: layer ? Boolean(layingSince) : Boolean(flock.closed_on),
    layingSince,
    provisional: Boolean(suggested),
    week: Math.floor((daysFrom(from, maxDate(from, to)) + flock.age_at_placement_days) / 7) + 1,
    birds,
    feed: m?.feed ?? 0,
    medication: m?.medication ?? 0,
    penExpenses: m?.direct ?? 0,
    overhead: m?.overhead ?? 0,
    total,
    feedBags: sum(rows, (d) => d.feedBags),
    feedKg: sum(rows, (d) => d.feedKg),
    doses,
    hens,
    perHen: hens ? total / hens : null,
  }
}

/** First day with eggs collected, as a suggested start of lay. */
export function suggestedLayStart(history: History, flock: Flock) {
  return (
    history.daily
      .filter((d) => d.flockId === flock.id && (d.eggs ?? 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null
  )
}

export type SpreadLine = {
  penId: number
  /** Rearing-period costs in this period, moved out of it into the flock's rearing investment. */
  moved: number
  /** This period's share of rearing cost (daily rate × laying days in the period). */
  spread: number
  /** Rearing cost not yet spread when the flock closed early, charged on the closing day. */
  writtenOff: number
  /** Flocks behind the figures, for notes: code, rearing total, weeks spread over. */
  flocks: { code: string; total: number }[]
}

/**
 * Per pen: how the "Spread rearing" P&L view differs from cash for a period. Layer flocks only.
 * Each layer flock's rearing cost is charged evenly over `layerLayingWeeks` from its start of lay.
 */
export function spreadCharges(history: History, catalog: Catalog, r: { from: string; to: string }, today = todayISO()): Map<number, SpreadLine> {
  const out = new Map<number, SpreadLine>()
  const days = farmSettings.layerLayingWeeks * 7
  for (const flock of history.flocks.filter((f) => laysEggs(catalog, f))) {
    const line = out.get(flock.pen_id) ?? { penId: flock.pen_id, moved: 0, spread: 0, writtenOff: 0, flocks: [] }
    const rear = rearingCost(history, catalog, flock, today)
    // Rearing-period costs that fall inside this period come out of it (the birds count too).
    const overlapFrom = maxDate(rear.from, r.from)
    const overlapTo = minDate(rear.to, r.to)
    if (overlapFrom <= overlapTo) {
      const m = penMoney(history, catalog, { from: overlapFrom, to: overlapTo }).find((x) => x.penId === flock.pen_id)
      const birdsInPeriod = sum(
        history.purchases.filter((p) => p.kind === 'birds' && p.flock_id === flock.id && inRange(p.purchased_on, r)),
        (p) => Number(p.total ?? p.quantity * p.unit_price),
      )
      // penMoney() already counts bird purchases dated inside the overlap; don't count them twice.
      const birdsInOverlap = sum(
        history.purchases.filter((p) => p.kind === 'birds' && p.flock_id === flock.id && inRange(p.purchased_on, { from: overlapFrom, to: overlapTo })),
        (p) => Number(p.total ?? p.quantity * p.unit_price),
      )
      line.moved += (m ? m.feed + m.medication + m.direct + m.overhead + m.birds : 0) - birdsInOverlap + birdsInPeriod
    }
    if (rear.layingSince && rear.total > 0) {
      const perDay = rear.total / days
      const spreadEnd = addDays(rear.layingSince, days - 1)
      const lastLaying = flock.closed_on ? minDate(flock.closed_on, spreadEnd) : spreadEnd
      const a = maxDate(rear.layingSince, r.from)
      const b = minDate(lastLaying, minDate(r.to, today))
      if (a <= b) line.spread += perDay * (daysFrom(a, b) + 1)
      if (flock.closed_on && flock.closed_on < spreadEnd && inRange(flock.closed_on, r)) {
        line.writtenOff += rear.total - perDay * (daysFrom(rear.layingSince, flock.closed_on) + 1)
      }
      line.flocks.push({ code: flock.code, total: rear.total })
    }
    if (line.moved || line.spread || line.writtenOff) out.set(flock.pen_id, line)
  }
  return out
}
