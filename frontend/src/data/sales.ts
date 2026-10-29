import { farmTodayISO } from './session'
// Mock sales matching P-D9 / P-D27 and the sale overlays.

export type ProductKind = 'Eggs' | 'Birds' | 'Droppings'

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

export const products: Product[] = [
  { id: 'eggs', kind: 'Eggs', name: 'Eggs · crate of 30', short: 'Eggs · crate', unit: 'crates', unitShort: 'cr', from: 'Egg store · all pens', minPrice: 4000, price: 4200 },
  { id: 'cracked', kind: 'Eggs', name: 'Cracked eggs · crate', short: 'Cracked eggs', unit: 'crates', unitShort: 'cr', from: 'Egg store · cracked', minPrice: 2000, price: 2500 },
  { id: 'spent-layers', kind: 'Birds', name: 'Spent layers · per bird', short: 'Spent layers', unit: 'birds', unitShort: 'birds', from: 'Pen 1 · culls', minPrice: 5000, price: 5500 },
  { id: 'droppings', kind: 'Droppings', name: 'Droppings · 25 kg bag', short: 'Droppings', unit: 'bags', unitShort: 'bags', from: 'Manure store', minPrice: 1200, price: 1500 },
]

export type PaymentMethod = 'cash' | 'transfer' | 'POS'

export type SaleEvent = { title: string; detail: string; time: string }

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
  /** Recently approved — kept highlighted. */
  approvedAt?: string
  history: SaleEvent[]
}

export const amountOf = (s: Sale) => s.qty * s.price

export type SaleStatus = 'needs-approval' | 'on-credit' | 'part-paid' | 'paid'

export function saleStatus(s: Sale): SaleStatus {
  if (s.pendingApproval) return 'needs-approval'
  if (s.paid >= amountOf(s)) return 'paid'
  return s.paid > 0 ? 'part-paid' : 'on-credit'
}

const todayIso = farmTodayISO()
/** Today as dd/mm, matching Sale.date. */
export const TODAY = `${todayIso.slice(8, 10)}/${todayIso.slice(5, 7)}`
/** First day (ISO) of the last seven days, today included. */
export const WEEK_START_ISO = new Date(Date.parse(todayIso) - 6 * 86_400_000).toISOString().slice(0, 10)
