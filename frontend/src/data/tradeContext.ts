import { createContext, useContext } from 'react'
import type { Customer } from './customers'
import type { Delivery, Order, StockMove } from './deliveries'
import type { Bill, StatementLine } from './ledger'
import type { Expense } from './expenses'
import type { Payment } from './payments'
import type { ProductionRecord } from './production'
import type { Purchase } from './purchases'
import type { PaymentMethod, Sale } from './sales'
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
  addCustomer: (customer: Customer) => void
  addSupplier: (supplier: Supplier) => void
  supplierBalance: (supplierId: string) => number
  supplierOpenBills: (supplierId: string) => Bill[]
  supplierStatement: (supplierId: string) => StatementLine[]
  /** Total paid on a purchase so far (at purchase + payments since). */
  purchasePaid: (ref: string) => number
  approveSale: (receipt: string, by: string) => void
  rejectSale: (receipt: string) => void
  addSale: (sale: Sale) => void
  /** Payment against one sale. */
  recordSalePayment: (receipt: string, amount: number, method: PaymentMethod) => void
  addPurchase: (purchase: Purchase) => void
  orders: Order[]
  deliveries: Delivery[]
  stockMoves: StockMove[]
  /** Base stock plus anything received or adjusted this session. */
  stockOf: (item: string, base: number) => number
  receiveDelivery: (ref: string, delivered: number, sentBack: number, note: string, by: string) => void
  addStockMoves: (moves: StockMove[]) => void
  expenses: Expense[]
  addExpense: (expense: Expense) => void
  /** Daily pen entries recorded this session. */
  productionRecords: ProductionRecord[]
  /** Saves the entry and takes its feed and medication out of stock. */
  addProductionRecord: (record: ProductionRecord) => void
  /** Payment outside a sale/purchase; clears the oldest bills first. Returns what it cleared. */
  recordPayment: (payment: NewPayment) => string
}

export const TradeContext = createContext<Trade | null>(null)

export function useTrade() {
  const ctx = useContext(TradeContext)
  if (!ctx) throw new Error('useTrade must be used inside TradeProvider')
  return ctx
}
