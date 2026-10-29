// Mock purchases matching P-D10 / P-D30 and the purchase overlays.

export type PurchaseKind = 'Feed' | 'Birds' | 'Medication'

export type PurchaseEvent = { title: string; detail: string; time: string }

export type Purchase = {
  ref: string
  /** ISO date */
  date: string
  supplierId: string
  kind: PurchaseKind
  item: string
  qty: number
  /** e.g. "bags", "birds", "× 100 g" */
  unit: string
  /** Price per unit as written on the invoice, e.g. "a bag". */
  per: string
  price: number
  /** Paid at the time of purchase. Later payments are ledger entries (payments.ts). */
  paidAtPurchase: number
  recordedBy: string
  received?: string
  history: PurchaseEvent[]
}

export const totalOf = (p: Purchase) => p.qty * p.price

export const refPrefix: Record<PurchaseKind, string> = { Feed: 'PF', Birds: 'PB', Medication: 'PM' }
