import { birdsOnRecord } from '../../data/penView'
import type { SalePortion } from '../../data/sales'
import type { Trade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

// Which pens a sale came from, by quantity: "40 crates — Pen 1 25, Pen 3 15". Rows hold the typed
// text; parsePortions() turns them into numbers for saving. The database checks the same rules.

export type PortionRow = { penId: number; qty: string }

export const num = (v: string) => Number(v.replace(/,/g, '')) || 0

export const parsePortions = (rows: PortionRow[]): SalePortion[] => rows.filter((r) => num(r.qty) > 0).map((r) => ({ penId: r.penId, qty: num(r.qty) }))
export const portionRows = (portions: SalePortion[] = []): PortionRow[] => portions.map((p) => ({ penId: p.penId, qty: formatNumber(p.qty) }))

export type PenChoice = { penId: number; name: string; birds: number | null }

/** Pens a product can come from: pens with a flock now; for bird products, only flocks of that bird type. */
export function penChoices(trade: Pick<Trade, 'catalog' | 'history'>, productId: string, exceptReceipt?: string): PenChoice[] {
  const { catalog, history } = trade
  const product = catalog.products.find((p) => String(p.id) === productId)
  const birds = product?.kind === 'birds'
  const exceptId = history.sales.find((s) => s.ref === exceptReceipt)?.id
  return catalog.pens
    .map((pen) => {
      const flock = history.flocks.find((f) => f.pen_id === pen.id && f.status === 'active')
      if (!flock || (birds && product?.bird_type_id && flock.bird_type_id !== product.bird_type_id)) return null
      return { penId: pen.id, name: pen.name, birds: birds ? birdsOnRecord(history, flock, exceptId) : null }
    })
    .filter((c): c is PenChoice => c !== null)
}

/** "" when the portions are fine to save, otherwise what's wrong. */
export function portionError(rows: PortionRow[], choices: PenChoice[], total: number, unit: string): string {
  if (!rows.length) return 'Add the pen it came from'
  if (rows.some((r) => num(r.qty) <= 0)) return 'Each pen needs a quantity'
  for (const r of rows) {
    const c = choices.find((x) => x.penId === r.penId)
    if (c?.birds !== null && c?.birds !== undefined && num(r.qty) > c.birds) return `${c.name} only has ${formatNumber(c.birds)} birds`
  }
  const given = rows.reduce((n, r) => n + num(r.qty), 0)
  return given === total ? '' : `Pens add up to ${formatNumber(given)} ${unit}, not ${formatNumber(total)}`
}
