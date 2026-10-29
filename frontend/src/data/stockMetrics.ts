import { farmSettings } from './farmSettings'
import type { FeedType } from './inventory'
import { addDays, bagsPerDay, datesBetween, inRange, lastPurchaseOf, staffWithRole, todayISO, withdrawals } from './metrics'
import type { Catalog, History, StockDay } from './remote'

// Stock and report figures (eggs, medication batches, feed reorder). Built on metrics.ts.

/** First name of the farm manager / owner, or a plain role name when nobody holds it. */
export function people(catalog: Catalog) {
  return {
    manager: staffWithRole(catalog, 'farm_manager')[0] ?? 'the farm manager',
    owner: staffWithRole(catalog, 'owner')[0] ?? 'the owner',
    keeper: staffWithRole(catalog, 'store_keeper')[0] ?? 'the store keeper',
  }
}

/** Eggs → crates, to one decimal place where it isn't whole. */
export const crates = (eggs: number) => Math.round((eggs / farmSettings.eggsPerCrate) * 10) / 10

/**
 * One row per day for an item, filling days with no movement so the ledger reads continuously.
 * Newest first. Opening comes from the day before's closing.
 */
export function dailyLedger(history: History, match: (d: StockDay) => boolean, from: string, to: string) {
  const days = history.stockDays.filter(match)
  const byDate = new Map<string, { received: number; used: number; adjusted: number; closing: number; opening: number }>()
  for (const d of days) {
    const x = byDate.get(d.date) ?? { received: 0, used: 0, adjusted: 0, closing: 0, opening: 0 }
    x.received += d.received
    x.used += d.used
    x.adjusted += d.adjusted
    x.closing += d.closing
    x.opening += d.opening
    byDate.set(d.date, x)
  }
  // Closing before the range starts: the latest movement day before `from`.
  const before = [...byDate.keys()].filter((d) => d < from).sort().pop()
  let closing = before ? byDate.get(before)!.closing : 0
  const rows = datesBetween(from, to).map((date) => {
    const x = byDate.get(date)
    const opening = closing
    if (x) closing = x.closing
    return { date, opening, received: x?.received ?? 0, used: x?.used ?? 0, adjusted: x?.adjusted ?? 0, closing }
  })
  return rows.reverse()
}

/** What moved a feed type's stock on a day, in words: deliveries, pen entries, counts. */
export function feedSource(history: History, catalog: Catalog, feedTypeId: number, date: string) {
  const parts: string[] = []
  for (const p of history.purchases.filter((x) => x.feed_type_id === feedTypeId && (x.received_on ?? x.purchased_on) === date && x.status === 'received')) {
    parts.push(`Delivery · ${catalog.suppliers.find((s) => s.id === p.supplier_id)?.name ?? 'supplier'} · ${p.ref}`)
  }
  const entries = history.daily.filter((d) => d.feedTypeId === feedTypeId && d.date === date && d.feedBags > 0)
  if (entries.length) parts.push(entries.length === 1 ? `Pen ${entries[0].penId} entry` : `${entries.length} pen entries`)
  for (const a of history.adjustments.filter((x) => x.item === 'feed' && x.feed_type_id === feedTypeId && x.adjusted_on === date)) {
    const reason = a.is_opening ? 'Opening stock' : (catalog.reasons.find((r) => r.id === a.reason_id)?.name ?? 'Count')
    parts.push([reason, a.note].filter(Boolean).join(': '))
  }
  return parts.join(' · ') || '—'
}

/** Pens in withdrawal with the eggs they've laid since their withdrawal began (kept apart, not sellable). */
export function heldEggs(history: History, catalog: Catalog, today = todayISO()) {
  const meds = new Map(catalog.medications.map((m) => [m.id, m]))
  return withdrawals(history, catalog, today).map((w) => {
    // Held from the first dose that still has its withdrawal running.
    const start = history.medLines
      .filter((l) => l.penId === w.penId && addDays(l.date, (meds.get(l.medicationId)?.withdrawal_days ?? 0) + 1) > today && (meds.get(l.medicationId)?.withdrawal_days ?? 0) > 0)
      .reduce((min, l) => (l.date < min ? l.date : min), w.lastDose)
    const eggs = history.daily.filter((d) => d.penId === w.penId && d.date >= start && d.date <= today).reduce((n, d) => n + (d.eggs ?? 0), 0)
    return { ...w, since: start, eggs }
  })
}

/** Which feed to reorder: the one in use with the least cover. Enough for two weeks, rounded to 10 bags. */
export function reorderSuggestion(history: History, catalog: Catalog, feeds: FeedType[]) {
  const inUse = feeds.filter((f) => f.daysOfCover !== null).sort((a, b) => a.daysOfCover! - b.daysOfCover!)
  const feed = inUse[0]
  if (!feed) return null
  const row = catalog.feedTypes.find((f) => f.name === feed.name)
  const perDay = (row && bagsPerDay(history, row.id)) || feed.bagsPerDay || 0
  const bags = Math.max(10, Math.ceil(Math.max(perDay * 14 - feed.bags, feed.reorderAt - feed.bags, perDay * 7) / 10) * 10)
  const last = row ? lastPurchaseOf(history, { feedTypeId: row.id }) : undefined
  const supplier = last ? catalog.suppliers.find((s) => s.id === last.supplier_id) : undefined
  return {
    feed: feed.name,
    daysOfCover: feed.daysOfCover!,
    bags,
    days: perDay ? Math.round(bags / perDay) : null,
    supplier: supplier?.name ?? null,
    lastPrice: last ? Number(last.unit_price) : null,
    lastDate: last?.purchased_on ?? null,
    /** Day stock runs out at the current rate. */
    runsOutOn: addDays(todayISO(), feed.daysOfCover!),
  }
}

/** Approved sales of a stock item (eggs) in a range: units sold and money. */
export function salesOfItem(history: History, catalog: Catalog, item: 'eggs' | 'cracked_eggs', r: { from: string; to: string }) {
  const ids = new Set(catalog.products.filter((p) => p.stock_item === item).map((p) => p.id))
  const rows = history.sales.filter((s) => s.approval === 'approved' && ids.has(s.product_id) && inRange(s.sold_on, r))
  return {
    qty: rows.reduce((n, s) => n + Number(s.quantity), 0),
    amount: rows.reduce((n, s) => n + Number(s.total ?? s.quantity * s.unit_price), 0),
  }
}
