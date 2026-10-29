import type { Kpi } from '../components/ui/KpiCard'
import { farmSettings } from './farmSettings'
import type { Catalog, DailyRow, History } from './remote'
import { farmTodayISO } from './session'

// Figures calculated from the records loaded in remote.ts. Pure functions: pass in
// trade.history / trade.catalog and get numbers back, so every screen counts the same way.

// ── Dates and periods ───────────────────────────────────────────────

export const todayISO = () => farmTodayISO()

export function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export const daysFrom = (fromISO: string, toISO: string) => Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000)

/** Every date from `from` to `to`, inclusive, oldest first. */
export function datesBetween(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** The last n days ending on `end` (default today), oldest first. */
export const lastDays = (n: number, end = todayISO()) => datesBetween(addDays(end, -(n - 1)), end)

/** Monday of the week containing iso. */
export function weekStart(iso: string) {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return addDays(iso, -((dow + 6) % 7))
}

export type Range = { from: string; to: string; label: string }

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'last-week' | 'month' | 'last-month' | 'quarter' | 'ytd' | '7d' | '30d' | '90d'

export function period(key: PeriodKey, today = todayISO()): Range {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  const monthStart = today.slice(0, 8) + '01'
  switch (key) {
    case 'today':
      return { from: today, to: today, label: 'Today' }
    case 'yesterday': {
      const d = addDays(today, -1)
      return { from: d, to: d, label: 'Yesterday' }
    }
    case 'week':
      return { from: weekStart(today), to: today, label: 'This week' }
    case 'last-week': {
      const from = addDays(weekStart(today), -7)
      return { from, to: addDays(from, 6), label: 'Last week' }
    }
    case 'month':
      return { from: monthStart, to: today, label: monthName(today) }
    case 'last-month': {
      const to = addDays(monthStart, -1)
      return { from: to.slice(0, 8) + '01', to, label: monthName(to) }
    }
    case 'quarter': {
      const qm = Math.floor((m - 1) / 3) * 3 + 1
      return { from: `${y}-${String(qm).padStart(2, '0')}-01`, to: today, label: `Q${Math.floor((m - 1) / 3) + 1} ${y}` }
    }
    case 'ytd': {
      // Financial year, from the month set in Settings.
      const start = farmSettings.financialYearStartMonth
      const fy = m >= start ? y : y - 1
      return { from: `${fy}-${String(start).padStart(2, '0')}-01`, to: today, label: 'Year to date' }
    }
    case '7d':
      return { from: addDays(today, -6), to: today, label: 'Last 7 days' }
    case '30d':
      return { from: addDays(today, -29), to: today, label: 'Last 30 days' }
    case '90d':
      return { from: addDays(today, -89), to: today, label: 'Last 90 days' }
  }
}

/** The same length of time just before r. Month periods compare with the same days of the previous month. */
export function previous(r: Range): Range {
  const len = daysFrom(r.from, r.to)
  if (r.from.endsWith('-01') && len >= 1 && len < 31) {
    const prevMonthEnd = addDays(r.from, -1)
    const from = prevMonthEnd.slice(0, 8) + '01'
    const to = addDays(from, len) > prevMonthEnd ? prevMonthEnd : addDays(from, len)
    return { from, to, label: 'previous period' }
  }
  const to = addDays(r.from, -1)
  return { from: addDays(to, -len), to, label: 'previous period' }
}

export const inRange = (iso: string, r: { from: string; to: string }) => iso >= r.from && iso <= r.to

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const monthName = (iso: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(utc(iso))
/** "09 Oct" */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const dayMonth = (iso: string) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`
/** "Fri 09/10" */
export const weekdayDm = (iso: string) => `${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(utc(iso))} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
/** "Fri 09 Oct" */
export const weekdayDayMonth = (iso: string) => `${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(utc(iso))} ${dayMonth(iso)}`
/** "09/10" */
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
/** "HH:MM" on the farm's clock. */
export const timeOf = (ts: string) =>
  ts ? new Intl.DateTimeFormat('en-GB', { timeZone: farmSettings.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)) : '—'
/** Now on the farm's clock, "HH:MM". */
export const nowHM = () => timeOf(new Date().toISOString())

/** "Today", "Yesterday", or "09 Oct". */
export function relativeDay(iso: string, today = todayISO()) {
  if (iso === today) return 'Today'
  if (iso === addDays(today, -1)) return 'Yesterday'
  return dayMonth(iso)
}

// ── Number formatting ───────────────────────────────────────────────

export const num = (n: number, digits = 0) => n.toLocaleString('en-NG', { minimumFractionDigits: digits, maximumFractionDigits: digits })
export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`

/** ₦1.24M, ₦845k, ₦900 */
export function nairaShort(n: number) {
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (a >= 1_000_000) return `${sign}₦${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`
  if (a >= 1_000) return `${sign}₦${Math.round(a / 1_000)}k`
  return `${sign}₦${Math.round(a)}`
}

/** Splits a naira amount into value + unit for KPI tiles: { value: '2.84', unit: 'million ₦' }. */
export function nairaKpi(n: number) {
  if (Math.abs(n) >= 1_000_000) return { value: (n / 1_000_000).toFixed(2), unit: 'million ₦' }
  if (Math.abs(n) >= 1_000) return { value: num(n / 1_000, 0), unit: 'thousand ₦' }
  return { value: num(n), unit: '₦' }
}

const safeDiv = (a: number, b: number) => (b ? a / b : null)

// ── KPIs ────────────────────────────────────────────────────────────

/**
 * A KPI tile from this period's figure and last period's. `points` compares as a difference
 * (for percentages); otherwise as a % change. `goodWhen` says which direction is good news.
 */
export function kpi(opts: {
  label: string
  value: string
  unit: string
  current: number | null
  previous: number | null
  points?: boolean
  digits?: number
  goodWhen?: 'up' | 'down' | 'neither'
  context: string
  info: string
  spark: number[]
}): Kpi {
  const { current, previous: prev, points, goodWhen = 'up' } = opts
  let delta = '—'
  let trend: Kpi['trend'] = 'flat'
  if (current !== null && prev !== null) {
    const diff = points ? current - prev : prev ? ((current - prev) / Math.abs(prev)) * 100 : null
    if (diff !== null) {
      const digits = opts.digits ?? (points ? 2 : 1)
      const rounded = Number(diff.toFixed(digits))
      trend = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat'
      delta = rounded === 0 ? 'No change' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(digits)}${points ? ' pts' : '%'}`
    }
  }
  const sentiment: Kpi['sentiment'] = trend === 'flat' || goodWhen === 'neither' ? 'neutral' : (trend === goodWhen) ? 'good' : 'bad'
  return { label: opts.label, value: opts.value, unit: opts.unit, delta, trend, sentiment, context: opts.context, info: opts.info, spark: opts.spark.length > 1 ? opts.spark : [opts.spark[0] ?? 0, opts.spark[0] ?? 0] }
}

/** Round, readable axis ticks covering min..max. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / Math.max(1, count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(6)))
  return out
}

// ── Production ──────────────────────────────────────────────────────

type PenFilter = (penId: number) => boolean
const allPens: PenFilter = () => true

export const rowsOn = (daily: DailyRow[], date: string, pen: PenFilter = allPens) => daily.filter((d) => d.date === date && pen(d.penId))
export const rowsIn = (daily: DailyRow[], r: { from: string; to: string }, pen: PenFilter = allPens) => daily.filter((d) => inRange(d.date, r) && pen(d.penId))

/** Eggs ÷ hens in layer pens, %. null when no layer entries. */
export function layingRate(rows: DailyRow[]) {
  const layers = rows.filter((d) => d.eggs !== null)
  const hens = layers.reduce((n, d) => n + d.opening, 0)
  return safeDiv(layers.reduce((n, d) => n + (d.eggs ?? 0), 0) * 100, hens)
}

/** Deaths ÷ opening birds, %. */
export function mortalityPct(rows: DailyRow[]) {
  return safeDiv(rows.reduce((n, d) => n + d.mortality, 0) * 100, rows.reduce((n, d) => n + d.opening, 0))
}

/** Feed used vs expected, % (positive = more than expected). */
export function feedVariance(rows: DailyRow[]) {
  const withTarget = rows.filter((d) => d.expectedKg)
  const expected = withTarget.reduce((n, d) => n + (d.expectedKg ?? 0), 0)
  return safeDiv((withTarget.reduce((n, d) => n + d.feedKg, 0) - expected) * 100, expected)
}

export const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((n, r) => n + f(r), 0)

/** Live birds per active flock: the latest closing count, or birds placed if nothing recorded yet. */
export function liveBirdsByPen(history: History, pen: PenFilter = allPens) {
  const out = new Map<number, number>()
  for (const f of history.flocks.filter((x) => x.status === 'active' && pen(x.pen_id))) {
    const latest = history.daily.filter((d) => d.flockId === f.id).sort((a, b) => b.date.localeCompare(a.date))[0]
    out.set(f.pen_id, latest ? latest.closing : f.birds_placed)
  }
  return out
}

/** One value per day for a sparkline or chart. */
export const series = (dates: string[], f: (date: string) => number | null) => dates.map((d) => f(d) ?? 0)

// ── Costs ───────────────────────────────────────────────────────────

type PurchaseRow = History['purchases'][number]
const purchaseTotal = (p: PurchaseRow) => Number(p.total ?? p.quantity * p.unit_price)

/** Weighted average cost of one stock unit (a bag of feed, a gram/vial of medication) from purchases. */
export function unitCost(history: History, item: { feedTypeId?: number | null; medicationId?: number | null }) {
  const buys = history.purchases.filter((p) => (item.feedTypeId ? p.feed_type_id === item.feedTypeId : p.medication_id === item.medicationId))
  const units = sum(buys, (p) => Number(p.quantity) * Number(p.stock_units_per_unit || 1))
  return safeDiv(sum(buys, purchaseTotal), units) ?? 0
}

/** Cost of a medication unit from the batch it came from, or the average. */
export function medicationUnitCost(history: History, medicationId: number, purchaseId: number | null) {
  const p = purchaseId ? history.purchases.find((x) => x.id === purchaseId) : undefined
  return p ? purchaseTotal(p) / (Number(p.quantity) * Number(p.stock_units_per_unit || 1)) : unitCost(history, { medicationId })
}

export type PenMoney = { penId: number; revenue: number; feed: number; medication: number; birds: number; overhead: number; direct: number; birdDays: number; eggs: number; feedKg: number }

/**
 * Money per pen over a period. Sales with a pen go to it; egg sales from the store are shared by
 * eggs collected. Feed and medication come from the daily entries at average cost. Bird purchases
 * go to the flock's pen. Expenses for a pen go to it; general overhead is shared by bird-days.
 */
export function penMoney(history: History, catalog: Catalog, r: { from: string; to: string }): PenMoney[] {
  const rows = rowsIn(history.daily, r)
  const pens = catalog.pens.map((p) => p.id)
  const out = new Map<number, PenMoney>(pens.map((id) => [id, { penId: id, revenue: 0, feed: 0, medication: 0, birds: 0, overhead: 0, direct: 0, birdDays: 0, eggs: 0, feedKg: 0 }]))
  const get = (id: number) => {
    if (!out.has(id)) out.set(id, { penId: id, revenue: 0, feed: 0, medication: 0, birds: 0, overhead: 0, direct: 0, birdDays: 0, eggs: 0, feedKg: 0 })
    return out.get(id)!
  }
  const bagCost = new Map<number, number>()
  for (const d of rows) {
    const m = get(d.penId)
    m.birdDays += d.opening
    m.eggs += d.eggs ?? 0
    m.feedKg += d.feedKg
    if (d.feedTypeId) {
      if (!bagCost.has(d.feedTypeId)) bagCost.set(d.feedTypeId, unitCost(history, { feedTypeId: d.feedTypeId }))
      m.feed += d.feedBags * bagCost.get(d.feedTypeId)!
    }
  }
  for (const l of history.medLines.filter((x) => inRange(x.date, r))) get(l.penId).medication += l.quantity * medicationUnitCost(history, l.medicationId, l.purchaseId)
  const flockPen = new Map(history.flocks.map((f) => [f.id, f.pen_id]))
  // Birds cost a pen when they are placed in it (from bird stock, at the purchase's cost a bird).
  for (const pl of history.placements.filter((x) => inRange(x.placed_on, r))) get(flockPen.get(pl.flock_id)!).birds += pl.birds * Number(pl.cost_per_bird ?? 0)

  const sales = history.sales.filter((s) => s.approval === 'approved' && inRange(s.sold_on, r))
  const totalEggs = sum([...out.values()], (m) => m.eggs)
  let storeRevenue = 0
  const portions = new Map<number, History['saleAllocations']>()
  for (const a of history.saleAllocations) portions.set(a.sale_id, [...(portions.get(a.sale_id) ?? []), a])
  for (const s of sales) {
    const split = portions.get(s.id)
    // A pen's portion earns its quantity × the sale price; unsplit sales are shared by eggs collected.
    if (split?.length) for (const a of split) get(a.pen_id).revenue += Number(a.quantity) * Number(s.unit_price)
    else storeRevenue += Number(s.total ?? s.quantity * s.unit_price)
  }
  for (const m of out.values()) if (totalEggs) m.revenue += (storeRevenue * m.eggs) / totalEggs

  const expenses = history.expenses.filter((e) => inRange(e.spent_on, r))
  for (const e of expenses.filter((x) => x.pen_id)) get(e.pen_id!).direct += Number(e.amount)
  const general = sum(expenses.filter((x) => !x.pen_id), (e) => Number(e.amount))
  const birdDays = sum([...out.values()], (m) => m.birdDays)
  for (const m of out.values()) m.overhead = birdDays ? (general * m.birdDays) / birdDays : 0
  return [...out.values()].filter((m) => m.birdDays || m.revenue || m.feed || m.direct || m.birds)
}

export const penCost = (m: PenMoney) => m.feed + m.medication + m.birds + m.overhead + m.direct

export type MoneyItem = { key: string; date: string; title: string; detail: string; amount: number }

/**
 * The items behind one pen's Sales, Feed and Pen expenses in penMoney(), by the same rules, so each
 * list adds up to the figure shown.
 */
export function penMoneyItems(history: History, catalog: Catalog, r: { from: string; to: string }, penId: number) {
  const rows = rowsIn(history.daily, r)
  const product = (id: number) => catalog.products.find((p) => p.id === id)
  const unitOf = (id: number) => product(id)?.unit ?? ''
  const qty = (n: number, unit: string) => `${num(n, n % 1 ? 1 : 0)} ${unit}${n === 1 ? '' : 's'}`

  // Sales: this pen's portions, plus its eggs-collected share of sales not split by pen.
  const totalEggs = sum(rows, (d) => d.eggs ?? 0)
  const penEggs = sum(rows.filter((d) => d.penId === penId), (d) => d.eggs ?? 0)
  const share = totalEggs ? penEggs / totalEggs : 0
  const portions = new Map<number, History['saleAllocations']>()
  for (const a of history.saleAllocations) portions.set(a.sale_id, [...(portions.get(a.sale_id) ?? []), a])
  const sales: MoneyItem[] = []
  for (const s of history.sales.filter((x) => x.approval === 'approved' && inRange(x.sold_on, r))) {
    const split = portions.get(s.id)
    const name = product(s.product_id)?.name ?? 'Sale'
    const price = Number(s.unit_price)
    if (split?.length) {
      const mine = split.find((a) => a.pen_id === penId)
      if (mine) {
        const q = Number(mine.quantity)
        const of = q === Number(s.quantity) ? '' : ` of ${num(Number(s.quantity))}`
        sales.push({ key: `s${s.id}`, date: s.sold_on, title: `${s.ref} · ${name}`, detail: `This pen’s portion: ${qty(q, unitOf(s.product_id))}${of} × ${naira(price)}`, amount: q * price })
      }
    } else if (share) {
      const total = Number(s.total ?? s.quantity * s.unit_price)
      sales.push({
        key: `s${s.id}`,
        date: s.sold_on,
        title: `${s.ref} · ${name}`,
        detail: `Auto-split: ${naira(total)} × ${(share * 100).toFixed(1)}% (this pen’s share of eggs collected)`,
        amount: total * share,
      })
    }
  }

  // Feed: each daily entry's bags × the average price paid a bag for that feed.
  const bagCost = new Map<number, number>()
  const feed: MoneyItem[] = rows
    .filter((d) => d.penId === penId && d.feedTypeId && d.feedBags > 0)
    .map((d) => {
      if (!bagCost.has(d.feedTypeId!)) bagCost.set(d.feedTypeId!, unitCost(history, { feedTypeId: d.feedTypeId }))
      const perBag = bagCost.get(d.feedTypeId!)!
      const feedName = catalog.feedTypes.find((f) => f.id === d.feedTypeId)?.name ?? 'Feed'
      return { key: `f${d.id}`, date: d.date, title: feedName, detail: `${num(d.feedBags, 1)} bags × ${naira(perBag)} average a bag`, amount: d.feedBags * perBag }
    })

  // Pen expenses: expenses recorded against this pen.
  const expenses: MoneyItem[] = history.expenses
    .filter((e) => e.pen_id === penId && inRange(e.spent_on, r))
    .map((e) => ({
      key: `e${e.id}`,
      date: e.spent_on,
      title: e.description,
      detail: `${e.ref} · ${catalog.categories.find((c) => c.id === e.category_id)?.name ?? 'Expense'}`,
      amount: Number(e.amount),
    }))

  const byDate = (a: MoneyItem, b: MoneyItem) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key)
  return { sales: sales.sort(byDate), feed: feed.sort(byDate), expenses: expenses.sort(byDate) }
}

// ── Medication ──────────────────────────────────────────────────────

export type Withdrawal = { penId: number; medication: string; lastDose: string; days: number; clearFrom: string; dayOf: number }

/** Pens whose eggs or birds can't be sold yet: last dose + withdrawal days. */
export function withdrawals(history: History, catalog: Catalog, today = todayISO()): Withdrawal[] {
  const meds = new Map(catalog.medications.map((m) => [m.id, m]))
  const byPen = new Map<number, Withdrawal>()
  for (const l of history.medLines) {
    const days = meds.get(l.medicationId)?.withdrawal_days ?? 0
    if (!days) continue
    const clearFrom = addDays(l.date, days + 1)
    if (clearFrom <= today) continue
    const prev = byPen.get(l.penId)
    if (!prev || clearFrom > prev.clearFrom) byPen.set(l.penId, { penId: l.penId, medication: meds.get(l.medicationId)!.name, lastDose: l.date, days, clearFrom, dayOf: daysFrom(l.date, today) })
  }
  return [...byPen.values()].sort((a, b) => a.penId - b.penId)
}

/** Medication on hand per medication, from the stock ledger (includes opening stock with no batch). */
export function medicationOnHand(catalog: Catalog) {
  const out = new Map<number, number>()
  for (const l of catalog.levels.filter((x) => x.item === 'medication' && x.medicationId)) out.set(l.medicationId!, (out.get(l.medicationId!) ?? 0) + l.onHand)
  return out
}

// ── Money owed ──────────────────────────────────────────────────────

export type AgeBucket = { label: string; amount: number; overdue: boolean }

/** Splits open bills into 0–30, 31–overdue and overdue+ days. */
export function ageBills(bills: { date: string; left: number }[], today = todayISO()): AgeBucket[] {
  const over = farmSettings.overdueDebtDays
  const mid = Math.min(30, over)
  const buckets: AgeBucket[] = [
    { label: `0–${mid} days`, amount: 0, overdue: false },
    { label: `${mid + 1}–${over} days`, amount: 0, overdue: false },
    { label: `${over}+ days`, amount: 0, overdue: true },
  ]
  for (const b of bills) {
    const d = daysFrom(b.date, today)
    buckets[d > over ? 2 : d > mid ? 1 : 0].amount += b.left
  }
  return over <= 30 ? [buckets[0], buckets[2]] : buckets
}

// ── Entries ─────────────────────────────────────────────────────────

export type MissingEntry = { penId: number; date: string; late: boolean }

/** Active pens with no entry yesterday (late), or none today once the cut-off has passed. */
export function missingEntries(history: History, today = todayISO(), now = nowHM()): MissingEntry[] {
  const yesterday = addDays(today, -1)
  const has = new Set(history.daily.map((d) => `${d.penId}|${d.date}`))
  const out: MissingEntry[] = []
  for (const f of history.flocks.filter((x) => x.status === 'active')) {
    if (f.placed_on <= yesterday && !has.has(`${f.pen_id}|${yesterday}`)) out.push({ penId: f.pen_id, date: yesterday, late: true })
    else if (now >= farmSettings.missingEntryCutoff && !has.has(`${f.pen_id}|${today}`)) out.push({ penId: f.pen_id, date: today, late: false })
  }
  return out
}

/** Names of the staff assigned to a pen (pen attendants with "all pens" are left out). */
export function penStaff(catalog: Catalog, penId: number) {
  const ids = new Set(catalog.staffPens.filter((s) => s.pen_id === penId).map((s) => s.profile_id))
  return catalog.profiles.filter((p) => ids.has(p.id) && p.is_active).map((p) => p.full_name.split(' ')[0])
}

/** First names of active staff with a role, e.g. staffWithRole(c, 'farm_manager') → ['Emeka']. */
export const staffWithRole = (catalog: Catalog, roleId: string) =>
  catalog.profiles.filter((p) => p.role_id === roleId && p.is_active).map((p) => p.full_name.split(' ')[0])

/** "the farm manager (Emeka)" or "the farm manager". */
export function roleWithName(catalog: Catalog, roleId: string, label: string) {
  const names = staffWithRole(catalog, roleId)
  return names.length ? `${label} (${names.join(', ')})` : label
}

// ── Feed reorder ────────────────────────────────────────────────────

/** Feed bags used per day over the last 7 days of entries. */
export function bagsPerDay(history: History, feedTypeId: number, today = todayISO()) {
  const days = history.stockDays.filter((d) => d.item === 'feed' && d.feedTypeId === feedTypeId && inRange(d.date, { from: addDays(today, -7), to: addDays(today, -1) }))
  const used = sum(days, (d) => d.used)
  return used ? used / 7 : null
}

/** Last purchase of a feed type: supplier, price and date. */
export function lastPurchaseOf(history: History, item: { feedTypeId?: number; medicationId?: number }) {
  return history.purchases
    .filter((p) => (item.feedTypeId ? p.feed_type_id === item.feedTypeId : p.medication_id === item.medicationId))
    .sort((a, b) => b.purchased_on.localeCompare(a.purchased_on))[0]
}
