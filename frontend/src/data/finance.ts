'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '../lib/supabase/client'
import type { Database } from '../lib/supabase/database.types'
import { farmSettings } from './farmSettings'
import { addDays, daysFrom, inRange, medicationUnitCost, penMoney, sum, unitCost, type MoneyItem } from './metrics'
import type { Payroll } from './payroll'
import { rearingCost, suggestedLayStart } from './rearing'
import type { Catalog, History } from './remote'

// Financial statements on an accrual basis (BRD reports; template supplied by the owner).
//
// Every figure comes from the farm's records with the same costs the rest of the app uses: feed and
// medication are costs when used (bags × average cost, doses × batch cost), birds when placed, and
// expenses when incurred. What is still on hand at a date — stock, birds, eggs, fixed assets — is an
// asset at cost. Because the Income Statement and the Balance Sheet are built from the same records
// and the same costs, they reconcile; anything that doesn't (a missing opening balance, cash taken
// outside the records) shows as an "Unreconciled difference", never hidden.

type Tables = Database['public']['Tables']
export type FixedAsset = Tables['fixed_assets']['Row']
export type FinanceEntry = Tables['finance_entries']['Row']
export type FinanceData = { assets: FixedAsset[]; entries: FinanceEntry[] }

const emptyFinance: FinanceData = { assets: [], entries: [] }

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string) {
  const { data, error } = await q
  if (error) throw new Error(`Couldn’t load ${what}: ${error.message}`)
  return data ?? []
}

/** Fixed assets and finance entries, loaded on demand (owner and accounts only, by RLS). */
export function useFinance() {
  const db = useMemo(() => createClient(), [])
  const [data, setData] = useState<FinanceData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [assets, entries] = await Promise.all([
        rows(db.from('fixed_assets').select('*').order('acquired_on').order('id'), 'fixed assets'),
        rows(db.from('finance_entries').select('*').order('entry_on').order('id'), 'capital and loans'),
      ])
      setData({ assets, entries })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [db])

  useEffect(() => {
    // Loading from Supabase (an external system) on open, so setting state here is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  const save = useCallback(
    async (run: (database: typeof db) => PromiseLike<{ error: { message: string } | null }>) => {
      const { error: e } = await run(db)
      if (e) {
        toast.error(/row-level security|permission denied|42501/i.test(e.message) ? 'You don’t have permission to do that.' : e.message.replace(/^.*?ERROR:\s*/, ''))
        return false
      }
      await reload()
      return true
    },
    [db, reload],
  )

  return { data: data ?? emptyFinance, loaded: data !== null, error, reload, save, db }
}

// ── Shared pieces ───────────────────────────────────────────────────

export type Line = {
  key: string
  label: string
  amount: number
  /** How the figure is worked out (info icon). */
  info: string
  /** The records behind the figure (tap to list). */
  items: MoneyItem[]
}

type Range = { from: string; to: string }
type Inputs = { history: History; catalog: Catalog; finance: FinanceData; payroll: Payroll | null; today?: string }

export const STATEMENT_LINES = {
  labour: 'Labour (wages and salaries)',
  utilities: 'Utilities and power',
  supplies: 'Supplies and packaging',
  healthcare: 'Veterinary services',
  maintenance: 'Repairs and maintenance',
  transport: 'Transport and delivery',
  marketing: 'Marketing and advertising',
  permits: 'Permits, licences and levies',
  misc: 'Miscellaneous',
} as const
export type StatementLine = keyof typeof STATEMENT_LINES
const OPERATING: StatementLine[] = ['labour', 'utilities', 'supplies', 'healthcare', 'maintenance']
const OVERHEAD: StatementLine[] = ['transport', 'marketing', 'permits', 'misc']

/** The go-live date (opening balances), or the start of the records if it isn't set. */
export const openingDate = (history: History) => farmSettings.goLiveDate ?? history.since

const money = (n: number | string | null | undefined) => Number(n ?? 0)
const total = (p: { total: number | null; quantity: number; unit_price: number }) => money(p.total ?? p.quantity * p.unit_price)
const accountOf = (method: string | null | undefined): 'cash' | 'bank' => (method === 'transfer' || method === 'pos' ? 'bank' : 'cash')
const item = (key: string, date: string, title: string, detail: string, amount: number): MoneyItem => ({ key, date, title, detail, amount })
const line = (key: string, label: string, items: MoneyItem[], info: string): Line => ({ key, label, amount: sum(items, (i) => i.amount), info, items })

function categoryLine(catalog: Catalog, categoryId: number): StatementLine {
  const c = catalog.categories.find((x) => x.id === categoryId) as (Catalog['categories'][number] & { statement_line?: string }) | undefined
  const saved = c?.statement_line as StatementLine | undefined
  if (saved && saved in STATEMENT_LINES) return saved
  const n = (c?.name ?? '').toLowerCase()
  if (/labour|wage|salar/.test(n)) return 'labour'
  if (/fuel|power|utilit|electric|water/.test(n)) return 'utilities'
  if (/equipment|suppl|packag|bedding/.test(n)) return 'supplies'
  if (/vet/.test(n)) return 'healthcare'
  if (/repair|maint/.test(n)) return 'maintenance'
  if (/transport|deliver/.test(n)) return 'transport'
  if (/market|advert/.test(n)) return 'marketing'
  if (/permit|licen|tax/.test(n)) return 'permits'
  return 'misc'
}

// ── Payroll pieces (posted months only) ─────────────────────────────

function payrollMonths(history: History, payroll: Payroll | null) {
  if (!payroll) return []
  return payroll.runs
    .filter((r) => r.status === 'approved' && r.expense_id)
    .map((r) => {
      const expense = history.expenses.find((e) => e.id === r.expense_id)
      const lines = payroll.lines.filter((l) => l.run_id === r.id)
      const items = payroll.items.filter((i) => lines.some((l) => l.id === i.line_id))
      return { run: r, date: expense?.spent_on ?? r.period, lines, items }
    })
}

// ── Stock at cost ───────────────────────────────────────────────────

/** Book value of feed and medication: received at cost + opening stock + counts − used, at the same costs the Income Statement uses. */
function stockValue(history: History, d: string, G: string) {
  const items: MoneyItem[] = []
  // From go-live on; stock held at go-live comes in through opening-stock adjustments.
  const live = (x: string) => x >= G && x <= d
  const feedIds = new Set([...history.purchases.filter((p) => p.feed_type_id).map((p) => p.feed_type_id!), ...history.adjustments.filter((a) => a.feed_type_id).map((a) => a.feed_type_id!)])
  for (const id of feedIds) {
    const avg = unitCost(history, { feedTypeId: id })
    const received = sum(history.purchases.filter((p) => p.feed_type_id === id && p.status === 'received' && p.received_on && live(p.received_on) && p.purchased_on >= G), total)
    const adjusted = sum(history.adjustments.filter((a) => a.feed_type_id === id && (a.is_opening ? a.adjusted_on <= d : live(a.adjusted_on))), (a) => money(a.quantity_change) * avg)
    const used = sum(history.daily.filter((r) => r.feedTypeId === id && live(r.date)), (r) => r.feedBags * avg)
    const value = received + adjusted - used
    if (Math.abs(value) > 0.5) items.push(item(`feed${id}`, d, `Feed · ${feedNameOf(history, id)}`, `Received at cost + opening stock and counts − used, at ${Math.round(avg).toLocaleString('en-NG')} a bag`, value))
  }
  const medIds = new Set([...history.purchases.filter((p) => p.medication_id).map((p) => p.medication_id!), ...history.adjustments.filter((a) => a.medication_id).map((a) => a.medication_id!)])
  for (const id of medIds) {
    const received = sum(history.purchases.filter((p) => p.medication_id === id && p.status === 'received' && p.received_on && live(p.received_on) && p.purchased_on >= G), total)
    const adjusted = sum(history.adjustments.filter((a) => a.medication_id === id && (a.is_opening ? a.adjusted_on <= d : live(a.adjusted_on))), (a) => money(a.quantity_change) * medicationUnitCost(history, id, a.purchase_id))
    const used = sum(history.medLines.filter((l) => l.medicationId === id && live(l.date)), (l) => l.quantity * medicationUnitCost(history, id, l.purchaseId))
    const value = received + adjusted - used
    if (Math.abs(value) > 0.5) items.push(item(`med${id}`, d, `Medication · ${medNameOf(history, id)}`, 'Batches received at cost + opening stock and counts − doses given', value))
  }
  return items
}
const names = { feed: new Map<number, string>(), med: new Map<number, string>() }
let namesFor: Catalog | null = null
function feedNameOf(_h: History, id: number) {
  return names.feed.get(id) ?? `Feed ${id}`
}
function medNameOf(_h: History, id: number) {
  return names.med.get(id) ?? `Medication ${id}`
}
function rememberNames(catalog: Catalog) {
  if (namesFor === catalog) return
  namesFor = catalog
  names.feed = new Map(catalog.feedTypes.map((f) => [f.id, f.name]))
  names.med = new Map(catalog.medications.map((m) => [m.id, m.name]))
}

/** Feed and medication ordered (and owed or paid) but not received by d. */
function goodsOnOrder(history: History, d: string, G: string) {
  return history.purchases
    .filter((p) => p.kind !== 'birds' && p.purchased_on >= G && p.purchased_on <= d && (p.status !== 'received' || !p.received_on || p.received_on > d))
    .map((p) => item(`order${p.id}`, p.purchased_on, `${p.ref} · ordered`, 'Paid for or owed, not yet received into the store', total(p)))
}

/** Bought birds not yet placed in a pen, at cost. Birds bought before go-live are opening bird stock. */
function birdStockValue(history: History, d: string) {
  return history.purchases
    .filter((p) => p.kind === 'birds' && p.purchased_on <= d)
    .map((p) => {
      const placed = sum(history.placements.filter((x) => x.purchase_id === p.id && x.placed_on <= d), (x) => x.birds * money(x.cost_per_bird))
      return item(`birds${p.id}`, p.purchased_on, `${p.ref} · birds in stock`, 'Bird purchase at cost − birds placed in pens', total(p) - placed)
    })
    .filter((i) => Math.abs(i.amount) > 0.5)
}

// ── Live birds and eggs at cost ─────────────────────────────────────

function birdsOnRecord(history: History, flockId: number, d: string, fallback: number) {
  const latest = history.daily.filter((r) => r.flockId === flockId && r.date <= d).sort((a, b) => b.date.localeCompare(a.date))[0]
  return latest ? latest.closing : fallback
}

/**
 * Live birds at cost on day d. Layers that have started laying: their rearing cost, less the share
 * already used up over the laying period. Flocks still growing: what they have cost so far. Both
 * scaled to the birds still alive.
 */
export function flockValues(history: History, catalog: Catalog, d: string): MoneyItem[] {
  const out: MoneyItem[] = []
  const days = farmSettings.layerLayingWeeks * 7
  for (const f of history.flocks.filter((x) => x.placed_on <= d && (!x.closed_on || x.closed_on > d))) {
    const placedBirds = sum(history.placements.filter((p) => p.flock_id === f.id && p.placed_on <= d), (p) => p.birds) || f.birds_placed
    const alive = birdsOnRecord(history, f.id, d, placedBirds)
    const layer = catalog.birdTypes.find((b) => b.id === f.bird_type_id)?.lays_eggs ?? false
    const layStart = layer ? (f.laying_started_on ?? suggestedLayStart(history, f)) : null
    if (layStart && layStart <= d) {
      const rear = rearingCost(history, catalog, f, d)
      const used = Math.min(1, (daysFrom(layStart, d) + 1) / days)
      const hens = rear.hens ?? placedBirds
      const value = rear.total * (1 - used) * Math.min(1, hens ? alive / hens : 1)
      out.push(item(`flock${f.id}`, d, `${f.code} · laying`, `Rearing cost ${Math.round(rear.total).toLocaleString('en-NG')} less ${Math.round(used * 100)}% used over ${farmSettings.layerLayingWeeks} weeks of lay, for ${alive.toLocaleString('en-NG')} birds`, value))
    } else {
      const birdCost = sum(history.placements.filter((p) => p.flock_id === f.id && p.placed_on <= d), (p) => p.birds * money(p.cost_per_bird))
      const m = penMoney(history, catalog, { from: f.placed_on, to: d }).find((x) => x.penId === f.pen_id)
      const cost = birdCost + (m ? m.feed + m.medication + m.direct + m.overhead : 0)
      const value = cost * Math.min(1, placedBirds ? alive / placedBirds : 1)
      out.push(item(`flock${f.id}`, d, `${f.code} · ${layer ? 'rearing' : 'growing'}`, `Cost so far (birds, feed, medication, pen and shared costs) for ${alive.toLocaleString('en-NG')} of ${placedBirds.toLocaleString('en-NG')} birds`, value))
    }
  }
  return out.filter((i) => Math.abs(i.amount) > 0.5)
}

/** Eggs in the store at cost: crates × what a crate cost to produce over the 30 days to d. */
export function eggValue(history: History, catalog: Catalog, d: string): MoneyItem[] {
  const crates = (['eggs', 'cracked_eggs'] as const).map((kind) => {
    const latest = history.stockDays.filter((s) => s.item === kind && s.date <= d).sort((a, b) => b.date.localeCompare(a.date))[0]
    return { kind, crates: (latest?.closing ?? 0) / farmSettings.eggsPerCrate }
  })
  const layerPens = new Set(catalog.pens.filter((p) => p.bird_types?.lays_eggs).map((p) => p.id))
  const window = { from: addDays(d, -29), to: d }
  const m = penMoney(history, catalog, window).filter((x) => layerPens.has(x.penId))
  const made = sum(m, (x) => x.eggs) / farmSettings.eggsPerCrate
  const perCrate = made ? sum(m, (x) => x.feed + x.medication + x.birds + x.direct + x.overhead) / made : 0
  return crates
    .filter((c) => c.crates > 0 && perCrate > 0)
    .map((c) => item(`eggs-${c.kind}`, d, c.kind === 'eggs' ? 'Eggs in the store' : 'Cracked eggs in the store', `${c.crates.toFixed(1)} crates × ${Math.round(perCrate).toLocaleString('en-NG')} cost a crate (layer costs ÷ crates collected, last 30 days)`, c.crates * perCrate))
}

// ── Fixed assets ────────────────────────────────────────────────────

const DAYS_A_MONTH = 30.4375

/** Depreciation of one asset between two dates (inclusive), straight-line, never below salvage. */
export function depreciation(a: FixedAsset, from: string, to: string) {
  if (!a.useful_life_months) return 0
  const start = from > a.acquired_on ? from : a.acquired_on
  const lifeEnd = addDays(a.acquired_on, Math.round(a.useful_life_months * DAYS_A_MONTH) - 1)
  let end = to < lifeEnd ? to : lifeEnd
  if (a.disposed_on && a.disposed_on < end) end = a.disposed_on
  if (start > end) return 0
  const perDay = (money(a.cost) - money(a.salvage_value)) / (a.useful_life_months * DAYS_A_MONTH)
  return perDay * (daysFrom(start, end) + 1)
}

/** Cost less depreciation up to d; 0 once disposed. */
export function bookValue(a: FixedAsset, d: string) {
  if (a.acquired_on > d || (a.disposed_on && a.disposed_on <= d)) return 0
  return money(a.cost) - depreciation(a, a.acquired_on, d)
}

// ── Income Statement ────────────────────────────────────────────────

export type IncomeStatement = {
  range: Range
  revenue: Line[]
  operating: Line[]
  overheads: Line[]
  totalRevenue: number
  totalOperating: number
  grossProfit: number
  totalOverheads: number
  netProfit: number
}

export function incomeStatement({ history, catalog, finance, payroll }: Inputs, r: Range): IncomeStatement {
  rememberNames(catalog)
  const G = openingDate(history)
  // Nothing before the opening balances counts as trading.
  const range = { from: r.from > G ? r.from : G, to: r.to }
  const inR = (d: string) => inRange(d, range)

  // 1. Revenue: approved sales by product, other income, deductions kept from pay.
  const sales = history.sales.filter((s) => s.approval === 'approved' && inR(s.sold_on))
  const revenue: Line[] = []
  for (const p of catalog.products) {
    const its = sales.filter((s) => s.product_id === p.id).map((s) => item(`s${s.id}`, s.sold_on, `${s.ref} · ${p.name}`, `${Number(s.quantity).toLocaleString('en-NG')} ${p.unit}${Number(s.quantity) === 1 ? '' : 's'} × ${Number(s.unit_price).toLocaleString('en-NG')}`, total(s)))
    if (its.length) revenue.push(line(`sales-${p.id}`, `Sale of ${p.name.toLowerCase()}`, its, 'Approved sales of this product dated in the period, at quantity × price, whether paid or on credit.'))
  }
  const other = finance.entries.filter((e) => e.kind === 'other_income' && inR(e.entry_on)).map((e) => item(e.ref, e.entry_on, e.ref, e.notes ?? 'Other income', money(e.amount)))
  if (other.length) revenue.push(line('other-income', 'Other income', other, 'Income recorded under Finance → Capital & loans as other income.'))
  const months = payrollMonths(history, payroll).filter((m) => inR(m.date))
  const kept = months.flatMap((m) => m.items.filter((i) => i.kind === 'deduction').map((i) => item(`d${i.id}`, m.date, i.label, 'Deducted from pay and kept by the farm', money(i.amount))))
  if (kept.length) revenue.push(line('staff-deductions', 'Deductions kept from pay', kept, 'Non-loan deductions on approved payslips (e.g. absence). Gross pay is the labour cost; what the farm keeps reduces it.'))

  // 2. Operating expenses.
  const operating: Line[] = []
  const feedIds = [...new Set(history.daily.filter((d) => inR(d.date) && d.feedTypeId && d.feedBags > 0).map((d) => d.feedTypeId!))]
  for (const id of feedIds) {
    const avg = unitCost(history, { feedTypeId: id })
    const its = history.daily
      .filter((d) => inR(d.date) && d.feedTypeId === id && d.feedBags > 0)
      .map((d) => item(`f${d.id}`, d.date, `${catalog.pens.find((p) => p.id === d.penId)?.name ?? `Pen ${d.penId}`} · ${d.feedBags.toFixed(1)} bags`, `× ${Math.round(avg).toLocaleString('en-NG')} average a bag`, d.feedBags * avg))
    operating.push(line(`feed-${id}`, `Feed · ${feedNameOf(history, id)}`, its, 'Bags used in daily entries × the average price paid a bag (received purchases). Feed bought but not used is stock on the Balance Sheet.'))
  }
  const placed = history.placements.filter((p) => inR(p.placed_on) && money(p.cost_per_bird) > 0)
  operating.push(
    line(
      'livestock',
      'Day-old chicks and pullets placed',
      placed.map((p) => item(`pl${p.id}`, p.placed_on, history.flocks.find((f) => f.id === p.flock_id)?.code ?? 'Flock', `${p.birds.toLocaleString('en-NG')} birds × ${money(p.cost_per_bird).toLocaleString('en-NG')}`, p.birds * money(p.cost_per_bird))),
      'Birds placed in pens × their cost a bird. Bought birds not yet placed are bird stock on the Balance Sheet.',
    ),
  )
  const meds = history.medLines.filter((l) => inR(l.date))
  operating.push(
    line(
      'medication',
      'Vaccines, medication and supplements',
      meds.map((l) => item(`m${l.id}`, l.date, `${medNameOf(history, l.medicationId)} · ${catalog.pens.find((p) => p.id === l.penId)?.name ?? ''}`, `${l.quantity.toLocaleString('en-NG')} units × batch cost`, l.quantity * medicationUnitCost(history, l.medicationId, l.purchaseId))),
      'Doses given in daily entries × the cost a unit of the batch they came from.',
    ),
  )
  const expenses = history.expenses.filter((e) => inR(e.spent_on))
  const byLine = (l: StatementLine) =>
    expenses
      .filter((e) => categoryLine(catalog, e.category_id) === l)
      .map((e) => item(`e${e.id}`, e.spent_on, `${e.ref} · ${e.description}`, catalog.categories.find((c) => c.id === e.category_id)?.name ?? '', money(e.amount)))
  for (const l of OPERATING) operating.push(line(`exp-${l}`, STATEMENT_LINES[l], byLine(l), `Expenses in categories mapped to “${STATEMENT_LINES[l]}” (Settings → Lists), dated in the period.${l === 'labour' ? ' Includes approved payroll at gross pay.' : ''}`))
  const losses = history.adjustments
    .filter((a) => !a.is_opening && (a.feed_type_id || a.medication_id) && inR(a.adjusted_on))
    .map((a) => {
      const cost = a.feed_type_id ? unitCost(history, { feedTypeId: a.feed_type_id }) : medicationUnitCost(history, a.medication_id!, a.purchase_id)
      const what = a.feed_type_id ? feedNameOf(history, a.feed_type_id) : medNameOf(history, a.medication_id!)
      return item(`a${a.id}`, a.adjusted_on, what, `${money(a.quantity_change) > 0 ? 'Found' : 'Short'} ${Math.abs(money(a.quantity_change)).toLocaleString('en-NG')} on count`, -money(a.quantity_change) * cost)
    })
  operating.push(line('stock-losses', 'Stock losses and write-offs', losses, 'Feed and medication found short (or over) on counts and write-offs, at cost. Broken eggs show in the egg stock change below.'))
  // Value added to growing flocks and eggs in store is not a cost of this period (it's an asset).
  const before = addDays(range.from, -1)
  const valueAt = (d: string) => [...flockValues(history, catalog, d), ...eggValue(history, catalog, d)]
  const startVal = valueAt(before)
  const endVal = valueAt(range.to)
  const change = sum(endVal, (i) => i.amount) - sum(startVal, (i) => i.amount)
  operating.push({
    key: 'bio-change',
    label: change >= 0 ? 'Less: value added to flocks and egg stock' : 'Add: value released from flocks and egg stock',
    amount: -change,
    info: 'Live birds and eggs in store are assets at cost. Their value at the end of the period less at the start is taken off costs (or added, when it falls), so only what was used up is a cost.',
    items: [...endVal.map((i) => ({ ...i, key: `end-${i.key}`, title: `${i.title} · end`, amount: -i.amount })), ...startVal.map((i) => ({ ...i, key: `start-${i.key}`, title: `${i.title} · start` }))],
  })

  // 4. Overheads.
  const overheads: Line[] = OVERHEAD.map((l) => line(`exp-${l}`, STATEMENT_LINES[l], byLine(l), `Expenses in categories mapped to “${STATEMENT_LINES[l]}” (Settings → Lists), dated in the period.`))
  overheads.push(
    line(
      'depreciation',
      'Depreciation',
      finance.assets
        .map((a) => item(`dep${a.id}`, range.to, a.name, `${a.category}, straight-line over ${a.useful_life_months ?? '—'} months`, depreciation(a, range.from, range.to)))
        .filter((i) => i.amount > 0.5),
      'Each fixed asset’s cost less salvage value, spread evenly over its useful life; the share for the days in this period. Land isn’t depreciated.',
    ),
  )
  const disposals = finance.assets
    .filter((a) => a.disposed_on && inR(a.disposed_on))
    .map((a) => item(`disp${a.id}`, a.disposed_on!, a.name, `Book value ${Math.round(money(a.cost) - depreciation(a, a.acquired_on, a.disposed_on!)).toLocaleString('en-NG')} − sold for ${money(a.disposal_amount).toLocaleString('en-NG')}`, money(a.cost) - depreciation(a, a.acquired_on, a.disposed_on!) - money(a.disposal_amount)))
  if (disposals.length) overheads.push(line('disposals', 'Loss (gain) on assets disposed of', disposals, 'Book value when sold or scrapped − what it was sold for. A negative figure is a gain.'))

  const totalRevenue = sum(revenue, (l) => l.amount)
  const totalOperating = sum(operating, (l) => l.amount)
  const totalOverheads = sum(overheads, (l) => l.amount)
  return {
    range,
    revenue,
    operating: operating.filter((l) => l.items.length || Math.abs(l.amount) > 0.5),
    overheads: overheads.filter((l) => l.items.length || Math.abs(l.amount) > 0.5),
    totalRevenue,
    totalOperating,
    grossProfit: totalRevenue - totalOperating,
    totalOverheads,
    netProfit: totalRevenue - totalOperating - totalOverheads,
  }
}

// ── Balance Sheet ───────────────────────────────────────────────────

export type BalanceSheet = {
  asAt: string
  openingDate: string
  currentAssets: Line[]
  fixedAssets: Line[]
  currentLiabilities: Line[]
  longTermLiabilities: Line[]
  equity: Line[]
  totalCurrentAssets: number
  totalFixedAssets: number
  totalAssets: number
  totalCurrentLiabilities: number
  totalLongTermLiabilities: number
  totalLiabilities: number
  totalEquity: number
  /** Total assets − (liabilities + equity). 0 when the records are complete. */
  difference: number
  /** False when payroll data isn't available to this role (its figures are then left out). */
  payrollIncluded: boolean
}

export function balanceSheet(inputs: Inputs, asAt: string): BalanceSheet {
  const { history, catalog, finance, payroll } = inputs
  rememberNames(catalog)
  const G = openingDate(history)
  const d = asAt
  const upToD = (x: string | null | undefined) => Boolean(x) && x! <= d
  const afterOpening = (x: string) => x >= G && x <= d
  const months = payrollMonths(history, payroll).filter((m) => m.date <= d)
  const payrollExpenseIds = new Set(payrollMonths(history, payroll).map((m) => m.run.expense_id))

  // ── Cash and bank: opening + money in − money out.
  const flows: (MoneyItem & { account: 'cash' | 'bank' })[] = []
  const flow = (account: 'cash' | 'bank', key: string, date: string, title: string, detail: string, amount: number) => {
    if (Math.abs(amount) > 0.004) flows.push({ ...item(key, date, title, detail, amount), account })
  }
  for (const e of finance.entries.filter((x) => upToD(x.entry_on))) {
    const acct = e.account === 'bank' ? 'bank' : 'cash'
    const a = money(e.amount)
    if (e.kind === 'opening_cash') flow(acct, e.ref, e.entry_on, `${e.ref} · opening balance`, 'At go-live', a)
    else if (e.entry_on < G) continue // before go-live: part of the opening position (loans) or not tracked
    else if (e.kind === 'capital_in') flow(acct, e.ref, e.entry_on, `${e.ref} · capital paid in`, e.counterparty ?? '', a)
    else if (e.kind === 'drawing') flow(acct, e.ref, e.entry_on, `${e.ref} · drawing`, e.counterparty ?? '', -a)
    else if (e.kind === 'loan_received') flow(acct, e.ref, e.entry_on, `${e.ref} · loan from ${e.counterparty}`, '', a)
    else if (e.kind === 'loan_repaid') flow(acct, e.ref, e.entry_on, `${e.ref} · loan repaid to ${e.counterparty}`, '', -a)
    else if (e.kind === 'other_income') flow(acct, e.ref, e.entry_on, `${e.ref} · other income`, e.notes ?? '', a)
  }
  for (const s of history.sales.filter((x) => x.approval === 'approved' && afterOpening(x.sold_on) && money(x.amount_paid) > 0)) flow(accountOf(s.payment_method), `s${s.id}`, s.sold_on, `${s.ref} · paid at sale`, '', money(s.amount_paid))
  for (const p of history.payments.filter((x) => afterOpening(x.paid_on))) flow(accountOf(p.method), `p${p.id}`, p.paid_on, `${p.ref} · ${p.direction === 'in' ? 'received' : 'paid out'}`, '', p.direction === 'in' ? money(p.amount) : -money(p.amount))
  for (const p of history.purchases.filter((x) => afterOpening(x.purchased_on) && money(x.amount_paid) > 0)) flow(accountOf(p.payment_method), `pu${p.id}`, p.purchased_on, `${p.ref} · paid at purchase`, '', -money(p.amount_paid))
  for (const e of history.expenses.filter((x) => afterOpening(x.spent_on) && money(x.amount_paid) > 0 && !payrollExpenseIds.has(x.id))) flow(accountOf(e.payment_method), `e${e.id}`, e.spent_on, `${e.ref} · ${e.description}`, 'Expense paid', -money(e.amount_paid))
  if (payroll) {
    for (const l of payroll.lines.filter((x) => x.paid_on && afterOpening(x.paid_on))) flow(accountOf(l.payment_method), `pay${l.id}`, l.paid_on!, 'Net pay', payroll.employees.find((e) => e.id === l.employee_id)?.full_name ?? '', -money(l.net))
    for (const ln of payroll.loans.filter((x) => (x.status === 'active' || x.status === 'repaid') && afterOpening(x.issued_on))) flow(accountOf(ln.payment_method), `ln${ln.id}`, ln.issued_on, `${ln.ref} · ${ln.kind} to staff`, '', -money(ln.amount))
  }
  for (const a of finance.assets) {
    if (a.paid_from && afterOpening(a.acquired_on)) flow(a.paid_from === 'bank' ? 'bank' : 'cash', `fa${a.id}`, a.acquired_on, `${a.name} · bought`, a.category, -money(a.cost))
    if (a.disposed_on && afterOpening(a.disposed_on) && money(a.disposal_amount) > 0) flow(a.disposal_account === 'bank' ? 'bank' : 'cash', `fd${a.id}`, a.disposed_on, `${a.name} · sold`, '', money(a.disposal_amount))
  }
  const cashItems = flows.filter((f) => f.account === 'cash')
  const bankItems = flows.filter((f) => f.account === 'bank')

  // ── Receivables.
  const receivables = [
    ...catalog.customers.filter((c) => money(c.opening_balance)).map((c) => item(`co${c.id}`, G, `${c.name} · opening balance`, '', money(c.opening_balance))),
    ...history.sales.filter((s) => s.approval === 'approved' && afterOpening(s.sold_on)).map((s) => item(`sr${s.id}`, s.sold_on, `${s.ref} · ${catalog.customers.find((c) => c.id === s.customer_id)?.name ?? s.buyer_name ?? 'Buyer'}`, 'Sale − paid at sale', total(s) - money(s.amount_paid))),
    ...history.payments.filter((p) => p.direction === 'in' && afterOpening(p.paid_on)).map((p) => item(`pr${p.id}`, p.paid_on, `${p.ref} · payment received`, '', -money(p.amount))),
  ].filter((i) => Math.abs(i.amount) > 0.004)

  // ── Staff advances and loans.
  const staffLoans = payroll
    ? [
        ...payroll.loans.filter((l) => (l.status === 'active' || l.status === 'repaid') && afterOpening(l.issued_on)).map((l) => item(`sl${l.id}`, l.issued_on, `${l.ref} · ${payroll.employees.find((e) => e.id === l.employee_id)?.full_name ?? ''}`, l.kind === 'advance' ? 'Salary advance' : 'Loan', money(l.amount))),
        ...months.flatMap((m) => m.items.filter((i) => i.kind === 'loan').map((i) => item(`slr${i.id}`, m.date, i.label, 'Repaid from pay', -money(i.amount)))),
      ]
    : []

  const currentAssets: Line[] = [
    line('cash', 'Cash in hand', cashItems, 'Opening cash + cash received (sales, payments, capital, loans) − cash paid out (purchases, expenses, pay, drawings, repayments, assets), from go-live to this date.'),
    line('bank', 'Bank (transfers and POS)', bankItems, 'Opening bank balance + transfers and POS received − transfers and POS paid out, from go-live to this date.'),
    line('receivables', 'Money owed by customers', receivables, 'Opening balances + approved sales not paid at the time − payments received, up to this date.'),
    ...(payroll ? [line('staff-loans', 'Staff advances and loans', staffLoans, 'Advances and loans paid to staff − repayments taken from approved payslips.')] : []),
    line('stock', 'Feed and medication in store', stockValue(history, d, G), 'Received at cost, plus opening stock and counts, less what daily entries used — the same costs the Income Statement uses.'),
    line('on-order', 'Goods ordered, not yet received', goodsOnOrder(history, d, G), 'Feed and medication purchases dated by this day but not yet received into the store, at their cost.'),
    line('bird-stock', 'Birds bought, not yet placed', birdStockValue(history, d), 'Bird purchases at cost less the birds placed in pens.'),
    line('flocks', 'Live birds (at cost)', flockValues(history, catalog, d), 'Laying flocks: rearing cost less the share used up over the laying period. Growing flocks: what they have cost so far. Scaled to the birds alive.'),
    line('eggs', 'Eggs in store (at cost)', eggValue(history, catalog, d), 'Crates in the egg store × what a crate cost to produce over the last 30 days.'),
  ]

  const fixedAssets: Line[] = (['land', 'buildings', 'equipment', 'machinery', 'vehicles'] as const).map((cat) =>
    line(
      `fa-${cat}`,
      { land: 'Land', buildings: 'Poultry houses and structures', equipment: 'Equipment (cages, feeders, drinkers, heaters)', machinery: 'Machinery (generators, pumps, mixers)', vehicles: 'Vehicles' }[cat],
      finance.assets.filter((a) => a.category === cat && bookValue(a, d) > 0).map((a) => item(`fa${a.id}`, a.acquired_on, a.name, `Cost ${money(a.cost).toLocaleString('en-NG')} − depreciation ${Math.round(depreciation(a, a.acquired_on, d)).toLocaleString('en-NG')}`, bookValue(a, d))),
      'Cost less depreciation to this date (straight-line over its useful life; land isn’t depreciated).',
    ),
  )

  // ── Liabilities.
  const payables = [
    ...catalog.suppliers.filter((s) => money(s.opening_balance)).map((s) => item(`so${s.id}`, G, `${s.name} · opening balance`, '', money(s.opening_balance))),
    ...history.purchases.filter((p) => afterOpening(p.purchased_on)).map((p) => item(`pp${p.id}`, p.purchased_on, `${p.ref} · purchase`, 'Total − paid at purchase', total(p) - money(p.amount_paid))),
    ...history.expenses.filter((e) => e.supplier_id && afterOpening(e.spent_on)).map((e) => item(`pe${e.id}`, e.spent_on, `${e.ref} · ${e.description}`, 'Expense − paid', money(e.amount) - money(e.amount_paid))),
    ...history.payments.filter((p) => p.direction === 'out' && afterOpening(p.paid_on)).map((p) => item(`po${p.id}`, p.paid_on, `${p.ref} · payment made`, '', -money(p.amount))),
  ].filter((i) => Math.abs(i.amount) > 0.004)
  const unpaidExpenses = history.expenses
    .filter((e) => !e.supplier_id && !payrollExpenseIds.has(e.id) && afterOpening(e.spent_on) && money(e.amount) > money(e.amount_paid))
    .map((e) => item(`ue${e.id}`, e.spent_on, `${e.ref} · ${e.description}`, 'Not yet paid', money(e.amount) - money(e.amount_paid)))
  const wages = payroll ? months.flatMap((m) => m.lines.filter((l) => !l.paid_on || l.paid_on > d).map((l) => item(`w${l.id}`, m.date, payroll.employees.find((e) => e.id === l.employee_id)?.full_name ?? 'Employee', 'Net pay approved, not yet paid', money(l.net)))) : []
  const statutory = payroll ? months.flatMap((m) => m.items.filter((i) => i.kind === 'statutory').map((i) => item(`st${i.id}`, m.date, i.label, 'Deducted from pay, to be paid over', money(i.amount)))) : []
  const loanItems = (term: 'short' | 'long') =>
    finance.entries
      .filter((e) => (e.kind === 'loan_received' || e.kind === 'loan_repaid') && e.loan_term === term && upToD(e.entry_on))
      .map((e) => item(e.ref, e.entry_on, `${e.ref} · ${e.counterparty}`, e.kind === 'loan_received' ? (e.entry_on < G ? 'Owed at go-live' : 'Received') : 'Repaid', e.kind === 'loan_received' ? money(e.amount) : -money(e.amount)))

  const currentLiabilities: Line[] = [
    line('payables', 'Money owed to suppliers', payables, 'Opening balances + purchases and supplier expenses not paid at the time − payments made, up to this date.'),
    line('unpaid-expenses', 'Other unpaid expenses', unpaidExpenses, 'Expenses with no supplier that aren’t fully paid yet.'),
    ...(payroll ? [line('wages', 'Wages approved, not yet paid', wages, 'Net pay on approved payslips not marked paid by this date.'), line('statutory', 'Statutory deductions to pay over', statutory, 'Pension, tax or other statutory lines deducted on approved payslips.')] : []),
    line('short-loans', 'Short-term loans', loanItems('short'), 'Loans due within a year: received − repaid (Finance → Capital & loans).'),
  ]
  const longTermLiabilities: Line[] = [line('long-loans', 'Long-term loans and partner notes', loanItems('long'), 'Loans due after a year: received − repaid (Finance → Capital & loans).')]

  // ── Equity.
  const birdsGiven = history.placements.filter((p) => !p.purchase_id && money(p.cost_per_bird) > 0 && upToD(p.placed_on))
  const assetsGiven = finance.assets.filter((a) => !a.paid_from && upToD(a.acquired_on))
  const openingStock = history.adjustments.filter((a) => a.is_opening && (a.feed_type_id || a.medication_id) && upToD(a.adjusted_on))
  const before = addDays(G, -1)
  const opening: MoneyItem[] = [
    ...finance.entries.filter((e) => e.kind === 'opening_cash' && upToD(e.entry_on)).map((e) => item(`oc${e.id}`, e.entry_on, `Opening ${e.account}`, '', money(e.amount))),
    ...catalog.customers.filter((c) => money(c.opening_balance)).map((c) => item(`oco${c.id}`, G, `${c.name} owed`, 'Opening balance', money(c.opening_balance))),
    ...catalog.suppliers.filter((s) => money(s.opening_balance)).map((s) => item(`oso${s.id}`, G, `Owed to ${s.name}`, 'Opening balance', -money(s.opening_balance))),
    ...finance.entries.filter((e) => e.entry_on < G && (e.kind === 'loan_received' || e.kind === 'loan_repaid') && upToD(e.entry_on)).map((e) => item(`ol${e.id}`, e.entry_on, `Loan · ${e.counterparty}`, 'Owed at go-live', e.kind === 'loan_received' ? -money(e.amount) : money(e.amount))),
    ...openingStock.map((a) => {
      const cost = a.feed_type_id ? unitCost(history, { feedTypeId: a.feed_type_id }) : medicationUnitCost(history, a.medication_id!, a.purchase_id)
      return item(`os${a.id}`, a.adjusted_on, `Opening stock · ${a.feed_type_id ? feedNameOf(history, a.feed_type_id) : medNameOf(history, a.medication_id!)}`, `${money(a.quantity_change)} × cost`, money(a.quantity_change) * cost)
    }),
    ...flockValues(history, catalog, before).map((i) => ({ ...i, key: `ob-${i.key}`, title: `${i.title} at go-live` })),
    // Birds bought before go-live and not placed by then (their bill is in the supplier's opening balance).
    ...birdStockValue(history, before).map((i) => ({ ...i, key: `obs-${i.key}`, title: `${i.title} at go-live` })),
    ...eggValue(history, catalog, before).map((i) => ({ ...i, key: `oe-${i.key}`, title: `${i.title} at go-live` })),
  ]
  const capital: MoneyItem[] = [
    ...finance.entries.filter((e) => (e.kind === 'capital_in' || e.kind === 'drawing') && afterOpening(e.entry_on)).map((e) => item(e.ref, e.entry_on, `${e.ref} · ${e.kind === 'capital_in' ? 'capital paid in' : 'drawing'}`, e.counterparty ?? '', e.kind === 'capital_in' ? money(e.amount) : -money(e.amount))),
    ...assetsGiven.map((a) => item(`ag${a.id}`, a.acquired_on, `${a.name} · brought into the farm`, a.acquired_on < G ? 'Value at go-live' : 'Contributed', money(a.cost) - (a.acquired_on < G ? depreciation(a, a.acquired_on, before) : 0))),
    ...birdsGiven.map((p) => item(`bg${p.id}`, p.placed_on, `${history.flocks.find((f) => f.id === p.flock_id)?.code ?? 'Flock'} · birds not from a purchase`, `${p.birds} × ${money(p.cost_per_bird)}`, p.birds * money(p.cost_per_bird))),
  ]
  const profit = d >= G ? incomeStatement(inputs, { from: G, to: d }) : null
  const equity: Line[] = [
    line('opening-equity', 'Opening equity at go-live', opening, 'What the farm owned less what it owed at go-live: opening cash and bank, customer and supplier balances, loans, opening stock and live birds.'),
    line('capital', 'Owner’s capital less drawings', capital, 'Capital paid in − drawings since go-live, plus assets and birds brought into the farm without a purchase.'),
    {
      key: 'retained',
      label: 'Retained earnings (profit since go-live)',
      amount: profit?.netProfit ?? 0,
      info: 'Net profit from go-live to this date (Income Statement).',
      items: profit ? [item('re', d, `Net profit ${G} – ${d}`, 'Income Statement for the whole period', profit.netProfit)] : [],
    },
  ]

  const totalCurrentAssets = sum(currentAssets, (l) => l.amount)
  const totalFixedAssets = sum(fixedAssets, (l) => l.amount)
  const totalCurrentLiabilities = sum(currentLiabilities, (l) => l.amount)
  const totalLongTermLiabilities = sum(longTermLiabilities, (l) => l.amount)
  const totalEquity = sum(equity, (l) => l.amount)
  const totalAssets = totalCurrentAssets + totalFixedAssets
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities
  return {
    asAt: d,
    openingDate: G,
    currentAssets,
    fixedAssets: fixedAssets.filter((l) => l.items.length),
    currentLiabilities,
    longTermLiabilities,
    equity,
    totalCurrentAssets,
    totalFixedAssets,
    totalAssets,
    totalCurrentLiabilities,
    totalLongTermLiabilities,
    totalLiabilities,
    totalEquity,
    difference: totalAssets - totalLiabilities - totalEquity,
    payrollIncluded: Boolean(payroll),
  }
}

export const unreconciledInfo = () =>
  'Assets − (liabilities + equity). It is zero when every record is in the app. Common causes: opening cash, bank, stock or balances at go-live not entered; money paid in or out that wasn’t recorded; a purchase received short or returned; payroll not visible to your role.'

