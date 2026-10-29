// Suppliers. What we owe is calculated from purchases, supplier expenses and payments (ledger.ts).

export type Supplier = {
  id: string
  name: string
  short: string
  initials: string
  kind: 'Feed' | 'Medication' | 'Birds' | 'Equipment'
  supplies: string
  since: string
  phone: string
  /** Pay within this many days of delivery. */
  termsDays: number
  lastPurchase: string
  lastPayment: string
  /** What we owed them at go-live. */
  opening?: number
  openingSource?: string
  openingChecked?: boolean
}

/** Filled in place from Supabase when the farm’s records load (remote.ts). */
export const suppliers: Supplier[] = []
