// Customers (P-D15) and their statements (P-D3), loaded from Supabase.
// Balances are never stored: they're calculated from each customer's ledger (see ledger.ts).

/** A sale from before the sales in `sales.ts`. */
export type OlderSale = {
  ref: string
  /** ISO date */
  date: string
  label: string
  amount: number
  /** Paid at the time of sale */
  paid: number
}

export type Customer = {
  id: string
  name: string
  short: string
  initials: string
  buys: string
  since: string
  area: string
  lastSale: string
  whatsapp: boolean
  /** Balance carried in when the farm went live (go-live date in Settings). */
  opening: number
  /** Where the opening balance came from, and whether someone checked it (go-live step 4). */
  openingSource?: string
  openingChecked?: boolean
  olderSales: OlderSale[]
}

/** Filled in place from Supabase when the farm’s records load (remote.ts). */
export const customers: Customer[] = []

/** Walk-in buyers who pay in full. */
export const ONE_OFF = { id: 'one-off', name: 'One-off buyer', initials: 'OB' }
