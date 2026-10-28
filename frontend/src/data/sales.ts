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

const recorded = (by: string, time: string): SaleEvent => ({ title: 'Sale recorded', detail: `By ${by} at the gate`, time })

export const initialSales: Sale[] = [
  {
    receipt: 'S-1043', date: '09/10 15:10', customerId: 'bodija', productId: 'eggs', qty: 50, price: 3800, paid: 0, recordedBy: 'Funmi A.', pendingApproval: true,
    history: [
      { title: 'Waiting for Emeka or Adeola', detail: 'Below the ₦4,000 minimum · receipt held', time: '15:10' },
      { title: 'Sent for approval', detail: 'By Funmi at the gate', time: '15:10' },
    ],
  },
  {
    receipt: 'S-1042', date: '09/10 11:21', customerId: 'mama-titi', productId: 'eggs', qty: 40, price: 4200, paid: 100000, method: 'transfer', recordedBy: 'Funmi A.',
    history: [{ title: 'Receipt delivered on WhatsApp', detail: 'To Mama Titi · she opted in', time: '11:22' }, recorded('Funmi', '11:21')],
  },
  { receipt: 'S-1041', date: '09/10 10:05', customerId: 'one-off', productId: 'spent-layers', qty: 12, price: 5500, paid: 66000, method: 'cash', recordedBy: 'Funmi A.', history: [recorded('Funmi', '10:05')] },
  { receipt: 'S-1040', date: '09/10 09:40', customerId: 'green-acres', productId: 'droppings', qty: 30, price: 1500, paid: 45000, method: 'transfer', recordedBy: 'Funmi A.', history: [recorded('Funmi', '09:40')] },
  { receipt: 'S-1039', date: '08/10 16:20', customerId: 'grace', productId: 'eggs', qty: 30, price: 4200, paid: 30000, method: 'POS', recordedBy: 'Funmi A.', history: [recorded('Funmi', '16:20')] },
  { receipt: 'S-1038', date: '08/10 12:05', customerId: 'kola', productId: 'eggs', qty: 20, price: 4200, paid: 84000, method: 'transfer', recordedBy: 'Funmi A.', history: [recorded('Funmi', '12:05')] },
  { receipt: 'S-1037', date: '08/10 10:30', customerId: 'one-off', productId: 'cracked', qty: 15, price: 2500, paid: 37500, method: 'cash', recordedBy: 'Funmi A.', history: [recorded('Funmi', '10:30')] },
  { receipt: 'S-1036', date: '07/10 14:45', customerId: 'st-marys', productId: 'eggs', qty: 25, price: 4200, paid: 0, recordedBy: 'Funmi A.', history: [recorded('Funmi', '14:45')] },
  { receipt: 'S-1035', date: '07/10 11:10', customerId: 'mrs-okafor', productId: 'eggs', qty: 35, price: 4200, paid: 100000, method: 'transfer', recordedBy: 'Funmi A.', history: [recorded('Funmi', '11:10')] },
  { receipt: 'S-1034', date: '06/10 15:20', customerId: 'grace', productId: 'eggs', qty: 25, price: 4200, paid: 105000, method: 'POS', recordedBy: 'Funmi A.', history: [recorded('Funmi', '15:20')] },
  { receipt: 'S-1033', date: '06/10 11:45', customerId: 'one-off', productId: 'eggs', qty: 4, price: 4300, paid: 17200, method: 'cash', recordedBy: 'Funmi A.', history: [recorded('Funmi', '11:45')] },
  { receipt: 'S-1032', date: '05/10 10:20', customerId: 'mrs-okafor', productId: 'eggs', qty: 30, price: 4200, paid: 126000, method: 'transfer', recordedBy: 'Funmi A.', history: [recorded('Funmi', '10:20')] },
  { receipt: 'S-1031', date: '02/10 16:10', customerId: 'mama-titi', productId: 'eggs', qty: 40, price: 4200, paid: 168000, method: 'transfer', recordedBy: 'Funmi A.', history: [recorded('Funmi', '16:10')] },
  { receipt: 'S-1030', date: '02/10 10:40', customerId: 'green-acres', productId: 'droppings', qty: 25, price: 1500, paid: 37500, method: 'transfer', recordedBy: 'Funmi A.', history: [recorded('Funmi', '10:40')] },
  { receipt: 'S-1029', date: '01/10 12:00', customerId: 'one-off', productId: 'cracked', qty: 10, price: 2500, paid: 25000, method: 'cash', recordedBy: 'Funmi A.', history: [recorded('Funmi', '12:00')] },
  { receipt: 'S-1028', date: '01/10 09:35', customerId: 'st-marys', productId: 'eggs', qty: 25, price: 4200, paid: 105000, method: 'transfer', recordedBy: 'Funmi A.', history: [recorded('Funmi', '09:35')] },
]

/** Days covered by "This week" in the mock (03–09 Oct). */
export const THIS_WEEK_FROM_DAY = 3
export const TODAY = '09/10'
