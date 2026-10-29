import type { Tone } from '../../components/ui/Badge'
import { totalOf, type Purchase } from '../../data/purchases'
import type { Cell } from '../../lib/export'
import { formatNumber } from '../../lib/format'

/** `paid` is the derived total paid so far (see ledger.supplierPurchases). */
export function purchaseStatus(p: Purchase, paid: number): { tone: Tone; label: string } {
  const left = totalOf(p) - paid
  if (left < 0) return { tone: 'info', label: `Credit ₦${formatNumber(-left)}` }
  if (left === 0) return { tone: 'success', label: 'Paid' }
  return paid > 0 ? { tone: 'warning', label: 'Part-paid' } : { tone: 'neutral', label: 'On credit' }
}

/** "100 bags", "10 × 100 g", "1,300 birds" */
export const formatQty = (p: Pick<Purchase, 'qty' | 'unit'>) => `${formatNumber(p.qty)} ${p.unit}`

/** "YYYY-10-06" → "06/10" */
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export const PURCHASE_CSV_HEADER = ['Ref', 'Date', 'Supplier', 'Kind', 'Item', 'Quantity', 'Unit', 'Price (₦)', 'Total (₦)', 'Paid (₦)', 'Recorded by']

/** One spreadsheet row per purchase, for downloadCsv. */
export function purchaseCsvRows(purchases: Purchase[], supplierName: (id: string) => string, paid: (ref: string) => number): Cell[][] {
  return purchases.map((p) => [p.ref, p.date, supplierName(p.supplierId), p.kind, p.item, p.qty, p.unit, p.price, totalOf(p), paid(p.ref), p.recordedBy])
}
