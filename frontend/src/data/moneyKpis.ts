import type { Kpi } from '../components/ui/KpiCard'
import type { Customer } from './customers'
import type { Expense } from './expenses'
import { farmSettings } from './farmSettings'
import { saleISODate, type Aging, type Bill } from './ledger'
import { addDays, ageBills, dayMonth, daysFrom, inRange, kpi, monthName, nairaKpi, num, period, previous, todayISO, type Range } from './metrics'
import type { Payment } from './payments'
import { totalOf, type Purchase, type PurchaseKind } from './purchases'
import { amountOf, products, type Sale } from './sales'
import type { Trade } from './tradeContext'

// KPI tiles and small figures for the money screens (sales, purchases, payments, customers,
// suppliers, expenses, deliveries, accounts home). Everything is calculated from useTrade().

type Span = { from: string; to: string }

/** A flat sparkline for tiles with no history to show (a single point can't be drawn). */
export const FLAT = [1, 1, 1, 1, 1, 1, 1]

/** This week (from Monday) and the same days last week. */
export function weekSpans(today = todayISO()) {
  const now = period('week', today)
  return { now, before: { from: addDays(now.from, -7), to: addDays(now.to, -7) } }
}

/** This month so far and the same days last month. */
export function monthSpans(today = todayISO()) {
  const now = period('month', today)
  return { now, before: previous(now) }
}

/** The last n whole weeks ending with this one, oldest first (for sparklines). */
export function weeksBack(n = 8, today = todayISO()): Span[] {
  const { now } = weekSpans(today)
  return Array.from({ length: n }, (_, i) => ({ from: addDays(now.from, -7 * (n - 1 - i)), to: addDays(now.to, -7 * (n - 1 - i)) }))
}

/** The last n months (each up to the same day of the month as today), oldest first. */
export function monthsBack(n = 6, today = todayISO()): Span[] {
  const out: Span[] = []
  let r: Span = period('month', today)
  for (let i = 0; i < n; i++) {
    out.unshift(r)
    r = previous({ ...r, label: '' })
  }
  return out
}

/** "03–09 Oct" or "28 Sep – 04 Oct" */
export function spanLabel(r: Span) {
  if (r.from === r.to) return dayMonth(r.from)
  return r.from.slice(0, 7) === r.to.slice(0, 7) ? `${r.from.slice(8, 10)}–${dayMonth(r.to)}` : `${dayMonth(r.from)} – ${dayMonth(r.to)}`
}

const money = (n: number) => nairaKpi(n)
const isApproved = (s: Sale) => !s.pendingApproval
export const saleDate = (s: Sale) => saleISODate(s)
export const salesIn = (sales: Sale[], r: Span) => sales.filter((s) => isApproved(s) && inRange(saleDate(s), r))
const salesTotal = (sales: Sale[], r: Span) => salesIn(sales, r).reduce((n, s) => n + amountOf(s), 0)
const isEggCrate = (s: Sale) => products.find((p) => p.id === s.productId)?.kind === 'Eggs'

// ── Sales ───────────────────────────────────────────────────────────

export function salesKpis(trade: Trade): Kpi[] {
  const { now, before } = weekSpans()
  const weeks = weeksBack()
  const sold = salesTotal(trade.sales, now)
  const eggs = (r: Span) => salesIn(trade.sales, r).filter(isEggCrate)
  const crates = (r: Span) => eggs(r).reduce((n, s) => n + s.qty, 0)
  const eggValue = eggs(now).reduce((n, s) => n + amountOf(s), 0)
  const credit = (r: Span) => salesIn(trade.sales, r).reduce((n, s) => n + Math.max(0, amountOf(s) - s.paid), 0)
  const collected = (r: Span) =>
    salesIn(trade.sales, r).reduce((n, s) => n + Math.min(s.paid, amountOf(s)), 0) +
    trade.payments.filter((p) => p.direction === 'in' && inRange(p.date, r)).reduce((n, p) => n + p.amount, 0)
  return [
    kpi({ label: 'Sales this week', ...money(sold), current: sold, previous: salesTotal(trade.sales, before), context: 'vs same days last week', info: 'Approved sales since Monday', spark: weeks.map((w) => salesTotal(trade.sales, w)) }),
    kpi({ label: 'Eggs sold', value: num(crates(now)), unit: 'crates', current: crates(now), previous: crates(before), context: crates(now) ? `avg ₦${num(eggValue / crates(now))} a crate` : 'none yet this week', info: 'Crates sold since Monday (whole and cracked)', spark: weeks.map(crates) }),
    kpi({ label: 'Sold on credit', ...money(credit(now)), current: credit(now), previous: credit(before), goodWhen: 'down', context: 'unpaid at sale', info: 'Value of this week’s sales not paid at the time of sale', spark: weeks.map(credit) }),
    kpi({ label: 'Collected', ...money(collected(now)), current: collected(now), previous: collected(before), context: sold ? `${Math.round((collected(now) / sold) * 100)}% of this week’s sales` : 'this week', info: 'Paid at sale plus payments received since Monday', spark: weeks.map(collected) }),
  ]
}

// ── Purchases ───────────────────────────────────────────────────────

const purchasesIn = (purchases: Purchase[], r: Span, kind?: PurchaseKind) => purchases.filter((p) => inRange(p.date, r) && (!kind || p.kind === kind))
const spent = (purchases: Purchase[], r: Span, kind?: PurchaseKind) => purchasesIn(purchases, r, kind).reduce((n, p) => n + totalOf(p), 0)

/** What we owe on purchases of one kind (or everything a supplier bills us when kind is missing). */
function owedFor(trade: Trade, kind?: PurchaseKind) {
  const kindOf = new Map(trade.purchases.map((p) => [p.ref, p.kind]))
  const bySupplier = trade.suppliers.map((s) => ({ s, left: trade.supplierOpenBills(s.id).filter((b) => !kind || kindOf.get(b.ref) === kind).reduce((n, b) => n + b.left, 0) }))
  const owing = bySupplier.filter((x) => x.left > 0).sort((a, b) => b.left - a.left)
  return { total: owing.reduce((n, x) => n + x.left, 0), owing }
}

/** Open supplier bills past the supplier's payment terms. */
export function overdueToSuppliers(trade: Trade, today = todayISO()) {
  return trade.suppliers.reduce(
    (n, s) => n + trade.supplierOpenBills(s.id).filter((b) => daysFrom(b.date, today) > s.termsDays).reduce((m, b) => m + b.left, 0),
    0,
  )
}

/** The latest price paid for the item bought most recently of a kind, compared with the price before. */
function latestPrice(purchases: Purchase[], kind: PurchaseKind) {
  const sorted = purchases.filter((p) => p.kind === kind).sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref))
  const last = sorted[0]
  if (!last) return null
  const sameItem = sorted.filter((p) => p.item === last.item)
  const prev = sameItem.find((p) => p.price !== last.price) ?? sameItem[1]
  return { last, prev, history: sameItem.slice(0, 8).reverse().map((p) => p.price) }
}

function priceKpi(purchases: Purchase[], kind: PurchaseKind, unit: string): Kpi {
  const lp = latestPrice(purchases, kind)
  if (!lp) return kpi({ label: 'Last price', value: '—', unit, current: null, previous: null, context: 'nothing bought yet', info: `Last price paid for ${kind.toLowerCase()}`, spark: FLAT })
  return kpi({
    label: `${lp.last.item} price`,
    value: num(lp.last.price),
    unit,
    current: lp.last.price,
    previous: lp.prev?.price ?? null,
    goodWhen: 'down',
    context: lp.prev ? `vs ₦${num(lp.prev.price)} on ${dayMonth(lp.prev.date)}` : `${lp.last.ref} · ${dayMonth(lp.last.date)}`,
    info: `Last price paid for ${lp.last.item.toLowerCase()}`,
    spark: lp.history.length > 1 ? lp.history : FLAT,
  })
}

export function purchaseKpis(trade: Trade, kind?: PurchaseKind): Kpi[] {
  const { purchases } = trade
  const { now, before } = monthSpans()
  const months = monthsBack()
  const month = monthName(now.to)
  const owed = owedFor(trade, kind)
  const owedContext = owed.owing.length ? owed.owing.slice(0, 2).map((x) => x.s.short).join(', ') : 'nothing owed'
  const owedTile = (label: string) =>
    kpi({ label, ...money(owed.total), current: null, previous: null, goodWhen: 'neither', context: owedContext, info: `Unpaid ${kind ? kind.toLowerCase() + ' ' : ''}purchases`, spark: FLAT })
  const bought = (label: string, k?: PurchaseKind) =>
    kpi({ label, ...money(spent(purchases, now, k)), current: spent(purchases, now, k), previous: spent(purchases, before, k), goodWhen: 'neither', context: `${month} vs same days last month`, info: `${k ?? 'Feed, birds and medication'} bought this month`, spark: months.map((m) => spent(purchases, m, k)) })
  const qty = (r: Span, k: PurchaseKind) => purchasesIn(purchases, r, k).reduce((n, p) => n + p.qty, 0)
  const last90 = { from: addDays(todayISO(), -89), to: todayISO() }

  if (!kind) {
    const overdue = overdueToSuppliers(trade)
    const feedBags = qty(now, 'Feed')
    return [
      bought('Bought this month'),
      kpi({ label: 'Feed bought', ...money(spent(purchases, now, 'Feed')), current: spent(purchases, now, 'Feed'), previous: spent(purchases, before, 'Feed'), goodWhen: 'neither', context: feedBags ? `${num(feedBags)} bags · avg ₦${num(spent(purchases, now, 'Feed') / feedBags)} a bag` : 'none this month', info: 'Feed bought this month', spark: months.map((m) => spent(purchases, m, 'Feed')) }),
      kpi({ label: 'Owed to suppliers', ...money(owed.total), current: null, previous: null, goodWhen: 'neither', context: overdue ? `₦${num(overdue)} past terms` : 'nothing overdue', info: 'Unpaid purchases and supplier expenses, all suppliers', spark: FLAT }),
      priceKpi(purchases, 'Feed', '₦ a bag'),
    ]
  }
  if (kind === 'Feed') {
    const byItem = new Map<string, number>()
    for (const p of purchasesIn(purchases, now, 'Feed')) byItem.set(p.item, (byItem.get(p.item) ?? 0) + p.qty)
    const top = [...byItem.entries()].sort((a, b) => b[1] - a[1])
    return [
      bought('Feed bought this month', 'Feed'),
      kpi({ label: 'Bags this month', value: num(qty(now, 'Feed')), unit: 'bags', current: qty(now, 'Feed'), previous: qty(before, 'Feed'), goodWhen: 'neither', context: top.length ? top.slice(0, 2).map(([i, q]) => `${i} ${num(q)}`).join(' · ') : 'none this month', info: 'Bags of feed bought this month', spark: months.map((m) => qty(m, 'Feed')) }),
      owedTile('Owed for feed'),
      priceKpi(purchases, 'Feed', '₦ a bag'),
    ]
  }
  if (kind === 'Birds') {
    return [
      kpi({ label: 'Birds bought this month', value: num(qty(now, 'Birds')), unit: 'birds', current: qty(now, 'Birds'), previous: qty(before, 'Birds'), goodWhen: 'neither', context: `${month} so far`, info: 'Birds bought this month', spark: months.map((m) => qty(m, 'Birds')) }),
      kpi({ label: 'Last 90 days', value: num(qty(last90, 'Birds')), unit: 'birds', current: null, previous: null, goodWhen: 'neither', context: `${purchasesIn(purchases, last90, 'Birds').length} batches`, info: 'Birds bought in the last 90 days', spark: FLAT }),
      owedTile('Owed for birds'),
      priceKpi(purchases, 'Birds', '₦ a bird'),
    ]
  }
  const warn = farmSettings.expiryWarningDays
  const expiring = trade.catalog.batches.filter((b) => b.onHand > 0 && b.expiry && daysFrom(todayISO(), b.expiry) <= warn)
  return [
    bought('Medication bought this month', 'Medication'),
    kpi({ label: 'Last 90 days', ...money(spent(purchases, last90, 'Medication')), current: null, previous: null, goodWhen: 'neither', context: `${purchasesIn(purchases, last90, 'Medication').length} orders`, info: 'Medication bought in the last 90 days', spark: FLAT }),
    owedTile('Owed for medication'),
    kpi({ label: `Expiring in ${warn} days`, value: String(expiring.length), unit: expiring.length === 1 ? 'batch' : 'batches', current: null, previous: null, goodWhen: 'neither', context: expiring[0] ? `${expiring[0].batchNo ?? 'batch'} · ${dayMonth(expiring[0].expiry!)}` : 'none', info: `Medication batches still in stock that expire within ${warn} days`, spark: FLAT }),
  ]
}

// ── Payments ────────────────────────────────────────────────────────

const paid = (payments: Payment[], dir: 'in' | 'out', r: Span) => payments.filter((p) => p.direction === dir && inRange(p.date, r))
const sumOf = (list: { amount: number }[]) => list.reduce((n, p) => n + p.amount, 0)

export function paymentKpis(trade: Trade): Kpi[] {
  const { now, before } = weekSpans()
  const weeks = weeksBack()
  const received = paid(trade.payments, 'in', now)
  const out = paid(trade.payments, 'out', now)
  const share = (m: Payment['method']) => (sumOf(received) ? Math.round((sumOf(received.filter((p) => p.method === m)) / sumOf(received)) * 100) : 0)
  const owed = trade.customers.reduce((n, c) => n + Math.max(0, trade.customerBalance(c.id)), 0)
  const owing = trade.customers.filter((c) => trade.customerBalance(c.id) > 0).length
  const topOut = [...new Set(out.map((p) => p.partyId))].map((id) => trade.suppliers.find((s) => s.id === id)?.name).filter(Boolean)
  return [
    kpi({ label: 'Received this week', ...money(sumOf(received)), current: sumOf(received), previous: sumOf(paid(trade.payments, 'in', before)), context: 'vs same days last week', info: 'Payments received outside a sale, since Monday', spark: weeks.map((w) => sumOf(paid(trade.payments, 'in', w))) }),
    kpi({ label: 'By transfer', value: String(share('transfer')), unit: '%', current: null, previous: null, goodWhen: 'neither', context: received.length ? `cash ${share('cash')}% · POS ${share('POS')}%` : 'nothing received yet', info: 'Share of this week’s payments received, by method', spark: FLAT }),
    kpi({ label: 'Paid to suppliers', ...money(sumOf(out)), current: sumOf(out), previous: sumOf(paid(trade.payments, 'out', before)), goodWhen: 'neither', context: topOut.length ? topOut.slice(0, 2).join(', ') : 'none this week', info: 'Payments made to suppliers since Monday', spark: weeks.map((w) => sumOf(paid(trade.payments, 'out', w))) }),
    kpi({ label: 'Still owed to the farm', ...money(owed), current: null, previous: null, goodWhen: 'neither', context: `${owing} customer${owing === 1 ? '' : 's'}`, info: 'All customer balances', spark: FLAT }),
  ]
}

// ── Customers ───────────────────────────────────────────────────────

/** Three ageing buckets from the overdue limit in Settings, in the AgingBar shape. */
export function agingOf(bills: Bill[], today = todayISO()): Aging {
  const b = ageBills(bills, today)
  const overdue = b.find((x) => x.overdue)?.amount ?? 0
  const open = b.filter((x) => !x.overdue)
  return { current: open[0]?.amount ?? 0, days31to60: open[1]?.amount ?? 0, over60: overdue }
}

/** Labels for the three AgingBar buckets, matching agingOf. */
export function agingLabels() {
  const over = farmSettings.overdueDebtDays
  const mid = Math.min(30, over)
  return { current: `0–${mid} days`, days31to60: `${mid + 1}–${over} days`, over60: `${over}+ days` }
}

type Settled = { date: string; amount: number; credit: boolean; settledOn: string | null }

/** Each approved sale to a customer with the day it was paid off (sale's own payment first, then payments oldest first). */
export function settlements(c: Customer, sales: Sale[], payments: Payment[]): Settled[] {
  const list = sales
    .filter((s) => s.customerId === c.id && isApproved(s))
    .map((s) => ({ date: saleDate(s), amount: amountOf(s), left: amountOf(s) - s.paid, credit: s.paid < amountOf(s) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const opening = c.opening > 0 ? { date: farmSettings.goLiveDate ?? '2000-01-01', amount: c.opening, left: c.opening, credit: false } : null
  const bills = opening ? [opening, ...list] : list
  const settledOn = new Map<object, string>()
  for (const b of bills) if (b.left <= 0) settledOn.set(b, b.date)
  for (const p of payments.filter((x) => x.direction === 'in' && x.partyId === c.id).sort((a, b) => a.date.localeCompare(b.date))) {
    let rest = p.amount
    for (const b of bills) {
      if (rest <= 0) break
      if (b.left <= 0) continue
      const applied = Math.min(b.left, rest)
      b.left -= applied
      rest -= applied
      if (b.left <= 0) settledOn.set(b, p.date)
    }
  }
  return list.map((b) => ({ date: b.date, amount: b.amount, credit: b.credit, settledOn: settledOn.get(b) ?? null }))
}

function payStats(trade: Trade, r: Span) {
  const all = trade.customers.flatMap((c) => settlements(c, trade.sales, trade.payments)).filter((s) => s.credit)
  const settled = all.filter((s) => s.settledOn && inRange(s.settledOn, r))
  const avgDays = settled.length ? settled.reduce((n, s) => n + daysFrom(s.date, s.settledOn!), 0) / settled.length : null
  // Credit sales old enough to judge: made in the range and at least 30 days ago.
  const judged = all.filter((s) => inRange(s.date, r) && daysFrom(s.date, r.to) >= 30)
  const onTime = judged.length ? (judged.filter((s) => s.settledOn && daysFrom(s.date, s.settledOn) <= 30).length * 100) / judged.length : null
  return { avgDays, onTime }
}

export function customerKpis(trade: Trade): Kpi[] {
  const today = todayISO()
  const rows = trade.customers.map((c) => ({ c, balance: trade.customerBalance(c.id), aging: agingOf(trade.customerOpenBills(c.id)) }))
  const owing = rows.filter((r) => r.balance > 0)
  const total = owing.reduce((n, r) => n + r.balance, 0)
  const overdue = rows.filter((r) => r.aging.over60 > 0).sort((a, b) => b.aging.over60 - a.aging.over60)
  const overdueTotal = overdue.reduce((n, r) => n + r.aging.over60, 0)
  const now: Range = { from: addDays(today, -89), to: today, label: '' }
  const before: Range = { from: addDays(today, -179), to: addDays(today, -90), label: '' }
  const a = payStats(trade, now)
  const b = payStats(trade, before)
  const over = farmSettings.overdueDebtDays
  return [
    kpi({ label: 'Owed to the farm', ...money(total), current: null, previous: null, goodWhen: 'neither', context: `${owing.length} customer${owing.length === 1 ? '' : 's'}`, info: 'All customer balances', spark: FLAT }),
    kpi({ label: `Over ${over} days`, ...money(overdueTotal), current: null, previous: null, goodWhen: 'neither', context: overdue.length ? overdue.slice(0, 2).map((r) => r.c.short).join(', ') : 'nobody overdue', info: `Bills unpaid for more than ${over} days`, spark: FLAT }),
    kpi({ label: 'Average days to pay', value: a.avgDays === null ? '—' : num(a.avgDays), unit: 'days', current: a.avgDays, previous: b.avgDays, points: true, digits: 0, goodWhen: 'down', context: 'last 90 days vs the 90 before', info: 'Average time from a credit sale to its full payment, for sales paid off in the last 90 days', spark: FLAT }),
    kpi({ label: 'Paid within 30 days', value: a.onTime === null ? '—' : num(a.onTime), unit: '%', current: a.onTime, previous: b.onTime, points: true, digits: 0, context: 'of credit sales', info: 'Credit sales from the last 90 days (at least 30 days old) paid off within 30 days', spark: FLAT }),
  ]
}

// ── Suppliers ───────────────────────────────────────────────────────

export function supplierKpis(trade: Trade): Kpi[] {
  const rows = trade.suppliers.map((s) => ({ s, balance: trade.supplierBalance(s.id) }))
  const owe = rows.filter((r) => r.balance > 0)
  const credit = rows.filter((r) => r.balance < 0).sort((a, b) => a.balance - b.balance)
  const overdue = overdueToSuppliers(trade)
  const { now, before } = monthSpans()
  const last90 = { from: addDays(todayISO(), -89), to: todayISO() }
  const active = trade.suppliers.filter((s) => trade.purchases.some((p) => p.supplierId === s.id && inRange(p.date, last90)) || trade.expenses.some((e) => e.supplierId === s.id && inRange(e.date, last90)))
  const kinds = new Set(active.map((s) => s.kind))
  return [
    kpi({ label: 'We owe', ...money(owe.reduce((n, r) => n + r.balance, 0)), current: null, previous: null, goodWhen: 'neither', context: `${owe.length} supplier${owe.length === 1 ? '' : 's'} · ${overdue ? `₦${num(overdue)} past terms` : 'nothing overdue'}`, info: 'Unpaid purchases and supplier expenses', spark: FLAT }),
    kpi({ label: 'Credit with suppliers', ...money(-credit.reduce((n, r) => n + r.balance, 0)), current: null, previous: null, goodWhen: 'neither', context: credit.length ? credit.slice(0, 2).map((r) => r.s.short).join(', ') : 'none', info: 'Money suppliers hold for us', spark: FLAT }),
    kpi({ label: 'Bought this month', ...money(spent(trade.purchases, now)), current: spent(trade.purchases, now), previous: spent(trade.purchases, before), goodWhen: 'neither', context: `${monthName(now.to)} vs same days last month`, info: 'Purchases this month', spark: monthsBack().map((m) => spent(trade.purchases, m)) }),
    kpi({ label: 'Active suppliers', value: String(active.length), unit: '', current: null, previous: null, goodWhen: 'neither', context: `${kinds.size} kind${kinds.size === 1 ? '' : 's'} of supply`, info: 'Suppliers used in the last 90 days', spark: FLAT }),
  ]
}

// ── People ──────────────────────────────────────────────────────────

/** Who approves sales below the minimum price: the farm managers and owners, by first name ("Emeka or Adeola"). */
export function approvers(trade: Trade) {
  const names = trade.catalog.profiles
    .filter((p) => p.is_active && (p.role_id === 'farm_manager' || p.role_id === 'owner'))
    .sort((a, b) => (a.role_id === b.role_id ? 0 : a.role_id === 'farm_manager' ? -1 : 1))
    .map((p) => p.full_name.split(' ')[0])
  if (!names.length) return 'a manager'
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

// ── Expenses ────────────────────────────────────────────────────────

export const expensesIn = (expenses: Expense[], r: Span) => expenses.filter((e) => inRange(e.date, r))
export const expenseTotal = (expenses: Expense[], r: Span) => expensesIn(expenses, r).reduce((n, e) => n + e.amount, 0)

/** "−4%" / "+12%" / "—" comparing two totals. */
export function pctChange(now: number, before: number) {
  if (!before) return '—'
  const d = Math.round(((now - before) / before) * 100)
  return d === 0 ? 'No change' : `${d > 0 ? '+' : '−'}${Math.abs(d)}%`
}
