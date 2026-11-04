import type { PaymentMethod } from './sales'
// Purchases (P-D10 / P-D30 and the purchase overlays), loaded from Supabase (remote.ts).

/** What a purchase is for. */
export type PurchaseKind = 'Feed' | 'Birds' | 'Medication'

/** One line in a purchase's history. */
export type PurchaseEvent = { title: string; detail: string; time: string }

/** A purchase as the purchase screens and ledgers use it. */
export type Purchase = {
  /** Birds only: what type, breed and age they arrive at (they go to bird stock until placed). */
  bird?: { birdTypeId: number; breed: string | null; ageDays: number }
  ref: string
  /** ISO date */
  date: string
  supplierId: string
  kind: PurchaseKind
  item: string
  qty: number
  /** e.g. "bags", "birds", "× 100 g" */
  unit: string
  /** Stock units in one unit bought, e.g. 100 g in a pack of medication (default 1). */
  unitsPerUnit?: number
  /** Price per unit as written on the invoice, e.g. "a bag". */
  per: string
  price: number
  /** Paid at the time of purchase. Later payments are ledger entries (payments.ts). */
  paidAtPurchase: number
  /** How the amount paid at purchase was paid. */
  method?: PaymentMethod
  /** Received into the store (feed and medication); birds are received on purchase. */
  isReceived?: boolean
  recordedBy: string
  received?: string
  history: PurchaseEvent[]
}

/** Purchase total: quantity × price. */
export const totalOf = (p: Purchase) => p.qty * p.price

/** Reference prefix for each kind of purchase, e.g. PF-0012 for feed. */
export const refPrefix: Record<PurchaseKind, string> = { Feed: 'PF', Birds: 'PB', Medication: 'PM' }
