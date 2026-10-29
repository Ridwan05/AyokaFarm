import type { Catalog, History } from '../../data/remote'
import type { BirdSource } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

// Where placed birds come from: batches in bird stock (bird purchases), or — owner only — birds that
// weren't bought (go-live flocks, own hatch). Rows hold the typed text; toBirdSources() parses them.
// The database checks the same rules when saving.

export type SourceRow = { kind: 'stock'; purchaseId: number; birds: string } | { kind: 'none'; birds: string; cost: string }

export type BatchChoice = {
  purchaseId: number
  ref: string
  label: string
  /** Birds that can still be placed from this batch. */
  left: number
  costPerBird: number | null
  ageDays: number
  breed: string | null
}

export const num = (v: string) => Number(v.replace(/,/g, '')) || 0

const ageLabel = (days: number) => (days === 0 ? 'Day-old' : `${Math.round(days / 7)}-week`)

/**
 * Bird stock batches of a bird type that still have birds. `credit` adds back birds already placed
 * from a batch by the placements being replaced (editing a flock's first-day birds).
 */
export function batchChoices(catalog: Catalog, birdTypeId: number | null, credit = new Map<number, number>()): BatchChoice[] {
  return catalog.birdStock
    .filter((b) => b.purchase_id !== null && b.bird_type_id === birdTypeId)
    .map((b) => {
      const left = (b.in_stock ?? 0) + (credit.get(b.purchase_id!) ?? 0)
      const cost = b.cost_per_bird === null ? null : Number(b.cost_per_bird)
      const what = `${ageLabel(b.bird_age_days ?? 0)} ${b.breed || b.bird_type || 'birds'}`
      return {
        purchaseId: b.purchase_id!,
        ref: b.ref ?? `#${b.purchase_id}`,
        label: `${b.ref} · ${what} · ${formatNumber(left)} left${cost !== null ? ` · ₦${formatNumber(cost)}` : ''}`,
        left,
        costPerBird: cost,
        ageDays: b.bird_age_days ?? 0,
        breed: b.breed,
      }
    })
    .filter((c) => c.left > 0)
}

/** Birds and cost of the rows as typed. */
export function sourceTotals(rows: SourceRow[], choices: BatchChoice[]) {
  let birds = 0
  let cost = 0
  for (const r of rows) {
    const n = num(r.birds)
    birds += n
    cost += n * (r.kind === 'stock' ? (choices.find((c) => c.purchaseId === r.purchaseId)?.costPerBird ?? 0) : num(r.cost))
  }
  return { birds, cost }
}

/** "" when the rows can be saved, otherwise what's wrong. */
export function sourceError(rows: SourceRow[], choices: BatchChoice[]): string {
  if (!rows.length) return 'Say where the birds came from'
  if (rows.some((r) => num(r.birds) <= 0)) return 'Each row needs a number of birds'
  for (const r of rows) {
    if (r.kind !== 'stock') continue
    const c = choices.find((x) => x.purchaseId === r.purchaseId)
    if (!c) return 'Pick a batch from bird stock'
    const asked = rows.filter((x) => x.kind === 'stock' && x.purchaseId === r.purchaseId).reduce((n, x) => n + num(x.birds), 0)
    if (asked > c.left) return `Only ${formatNumber(c.left)} birds left in ${c.ref}`
  }
  return ''
}

export const toBirdSources = (rows: SourceRow[]): BirdSource[] =>
  rows
    .filter((r) => num(r.birds) > 0)
    .map((r) => (r.kind === 'stock' ? { purchaseId: r.purchaseId, birds: num(r.birds) } : { purchaseId: null, birds: num(r.birds), costPerBird: r.cost.trim() ? num(r.cost) : null }))

/** Rows for existing placements (editing a flock). */
export const rowsFromPlacements = (placements: History['placements']): SourceRow[] =>
  placements.map((p) =>
    p.purchase_id !== null
      ? { kind: 'stock', purchaseId: p.purchase_id, birds: formatNumber(p.birds) }
      : { kind: 'none', birds: formatNumber(p.birds), cost: p.cost_per_bird === null ? '' : formatNumber(Number(p.cost_per_bird)) },
  )

/** "PB-0004 · 1,000 · ₦850 a bird", "Not from a purchase · 1,200", with the date for top-ups. */
export function placementLabel(history: History, p: History['placements'][number], flockPlacedOn: string) {
  const ref = p.purchase_id !== null ? (history.purchases.find((x) => x.id === p.purchase_id)?.ref ?? 'Bird purchase') : 'Not from a purchase'
  const cost = p.cost_per_bird !== null ? ` · ₦${formatNumber(Number(p.cost_per_bird))} a bird` : ''
  const when = p.placed_on !== flockPlacedOn ? ` · added ${p.placed_on.slice(8, 10)}/${p.placed_on.slice(5, 7)}` : ''
  return `${ref} · ${formatNumber(p.birds)}${cost}${when}`
}
