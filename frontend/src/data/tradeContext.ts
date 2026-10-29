import type { Catalog, History } from './remote'
import { createContext, useContext } from 'react'
import type { Customer } from './customers'
import type { Delivery, Order, StockMove } from './deliveries'
import type { Bill, StatementLine } from './ledger'
import type { Expense } from './expenses'
import type { Payment } from './payments'
import type { ProductionRecord } from './production'
import type { Purchase } from './purchases'
import type { PaymentMethod, Sale, SalePortion } from './sales'
import type { Supplier } from './suppliers'

export type NewPayment = {
  direction: 'in' | 'out'
  partyId: string
  amount: number
  method: PaymentMethod
  reference: string | null
  date: string
}

export type Trade = {
  sales: Sale[]
  purchases: Purchase[]
  payments: Payment[]
  customers: Customer[]
  suppliers: Supplier[]
  /** Calculated from open bills. */
  customerBalance: (customerId: string) => number
  customerOpenBills: (customerId: string) => Bill[]
  customerStatement: (customerId: string) => StatementLine[]
  addCustomer: (customer: Customer) => Promise<boolean>
  addSupplier: (supplier: Supplier) => Promise<boolean>
  supplierBalance: (supplierId: string) => number
  supplierOpenBills: (supplierId: string) => Bill[]
  supplierStatement: (supplierId: string) => StatementLine[]
  /** Total paid on a purchase so far (at purchase + payments since). */
  purchasePaid: (ref: string) => number
  approveSale: (receipt: string, by: string) => Promise<boolean>
  rejectSale: (receipt: string) => Promise<boolean>
  /** Saves the sale and its pen portions together (record_sale). */
  addSale: (sale: Sale) => Promise<boolean>
  /** Replace a sale's pen portions; an empty list means auto-split (not allowed for birds). */
  setSaleAllocations: (receipt: string, portions: SalePortion[]) => Promise<boolean>
  /** Payment against one sale. */
  recordSalePayment: (receipt: string, amount: number, method: PaymentMethod) => Promise<boolean>
  addPurchase: (purchase: Purchase) => Promise<boolean>
  orders: Order[]
  deliveries: Delivery[]
  stockMoves: StockMove[]
  /** Stock on hand now, from the stock ledger in Supabase. The base argument is ignored (kept for old callers). */
  stockOf: (item: string, base?: number) => number
  receiveDelivery: (ref: string, delivered: number, sentBack: number, note: string, by: string) => Promise<boolean>
  addStockMoves: (moves: StockMove[]) => Promise<boolean>
  expenses: Expense[]
  addExpense: (expense: Expense) => Promise<boolean>
  /** Today's pen entries. */
  productionRecords: ProductionRecord[]
  /** Saves the entry and takes its feed and medication out of stock. */
  addProductionRecord: (record: ProductionRecord) => Promise<boolean>
  /** Payment outside a sale/purchase; clears the oldest bills first. Returns what it cleared (saving continues in the background). */
  recordPayment: (payment: NewPayment) => string
  addPen: (pen: NewPen) => Promise<boolean>
  placeFlock: (flock: NewFlock) => Promise<boolean>
  /** The farm_settings row (null before setup). The same values are in farmSettings. */
  settings: Catalog['settings']
  /** Up to 400 days of production, stock and money records, for dashboards and reports (see metrics.ts). */
  history: History
  /** Reference rows with ids, including inactive ones (for Settings). */
  catalog: Catalog
  /** Load everything again from Supabase. */
  reload: () => Promise<void>
}

export type NewPen = { name: string; type: 'Layers' | 'Broilers'; capacity: number }
export type NewFlock = { code: string; penId: number; type: 'Layers' | 'Broilers'; breed: string; placedOn: string; ageAtPlacementDays: number; birds: number }

export const TradeContext = createContext<Trade | null>(null)

export function useTrade() {
  const ctx = useContext(TradeContext)
  if (!ctx) throw new Error('useTrade must be used inside TradeProvider')
  return ctx
}
