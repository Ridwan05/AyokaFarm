import { farmTodayISO } from './session'
// Sales (P-D9 / P-D27 and the sale overlays), loaded from Supabase (remote.ts).

/** What a product is: eggs, birds or droppings. */
export type ProductKind = 'Eggs' | 'Birds' | 'Droppings'

/** A product the farm sells, with its usual and minimum price. */
export type Product = {
  id: string
  kind: ProductKind
  name: string
  /** Short form for tables, e.g. "Eggs · crate". */
  short: string
  unit: string
  unitShort: string
  from: string
  minPrice: number
  price: number
}

/** The farm's products. These are defaults; remote.ts replaces them with the products table when the records load. */
export const products: Product[] = [
  { id: 'eggs', kind: 'Eggs', name: 'Eggs · crate of 30', short: 'Eggs · crate', unit: 'crates', unitShort: 'cr', from: 'Egg store · all pens', minPrice: 4000, price: 4200 },
  { id: 'cracked', kind: 'Eggs', name: 'Cracked eggs · crate', short: 'Cracked eggs', unit: 'crates', unitShort: 'cr', from: 'Egg store · cracked', minPrice: 2000, price: 2500 },
  { id: 'spent-layers', kind: 'Birds', name: 'Spent layers · per bird', short: 'Spent layers', unit: 'birds', unitShort: 'birds', from: 'Pen 1 · culls', minPrice: 5000, price: 5500 },
  { id: 'droppings', kind: 'Droppings', name: 'Droppings · 25 kg bag', short: 'Droppings', unit: 'bags', unitShort: 'bags', from: 'Manure store', minPrice: 1200, price: 1500 },
]

/** How money changed hands. */
export type PaymentMethod = 'cash' | 'transfer' | 'POS'

/** One line in a sale's history. */
export type SaleEvent = { title: string; detail: string; time: string }

/** A sale as the sales screens and ledgers use it. */
export type Sale = {
  receipt: string
  /** dd/mm hh:mm */
  date: string
  /** Full ISO date (YYYY-MM-DD), so statements work across years. */
  iso?: string
  customerId: string
  productId: string
  qty: number
  price: number
  paid: number
  method?: PaymentMethod
  recordedBy: string
  /** Waiting for an owner or manager because the price is below the minimum. */
  pendingApproval?: boolean
  /** How much of the sale came from each pen. Empty = auto-split by eggs collected (not allowed for birds). */
  allocations?: SalePortion[]
  /** Recently approved — kept highlighted. */
  approvedAt?: string
  history: SaleEvent[]
}

/** One pen's share of a sale, by quantity. */
export type SalePortion = { penId: number; qty: number }

/** Sale total: quantity × price. */
export const amountOf = (s: Sale) => s.qty * s.price

/** Where a sale stands with approval and payment. */
export type SaleStatus = 'needs-approval' | 'on-credit' | 'part-paid' | 'paid'

/** `left`: what's still owed on the sale after every payment (trade.saleLeft); defaults to total − paid at sale. */
export function saleStatus(s: Sale, left = amountOf(s) - s.paid): SaleStatus {
  if (s.pendingApproval) return 'needs-approval'
  if (left <= 0) return 'paid'
  return left < amountOf(s) ? 'part-paid' : 'on-credit'
}

// Worked out once when the module loads, on the farm's (Lagos) calendar.
const todayIso = farmTodayISO()
/** Today as dd/mm, matching Sale.date. */
export const TODAY = `${todayIso.slice(8, 10)}/${todayIso.slice(5, 7)}`
/** First day (ISO) of the last seven days, today included. */
export const WEEK_START_ISO = new Date(Date.parse(todayIso) - 6 * 86_400_000).toISOString().slice(0, 10)
