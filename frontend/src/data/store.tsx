'use client'

import { useState, type ReactNode } from 'react'
import { customers as initialCustomers } from './customers'
import { initialDeliveries, initialOrders, type StockMove } from './deliveries'
import { allocate, customerBills, customerStatement, describeAllocation, sumLeft, supplierBalance, supplierBills, supplierPurchases, supplierStatement } from './ledger'
import { initialExpenses } from './expenses'
import { initialPayments } from './payments'
import type { ProductionRecord } from './production'
import { initialPurchases } from './purchases'
import { initialSales } from './sales'
import { suppliers as initialSuppliers } from './suppliers'
import { TradeContext, type Trade } from './tradeContext'
import { useCurrentUser } from './sessionContext'

// In-memory store for records that several screens change (sales, purchases, payments).
// Swap for API calls + a query cache when the backend exists.

export function TradeProvider({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser()
  const [sales, setSales] = useState(initialSales)
  const [purchases, setPurchases] = useState(initialPurchases)
  const [payments, setPayments] = useState(initialPayments)
  const [customers, setCustomers] = useState(initialCustomers)
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [orders, setOrders] = useState(initialOrders)
  const [deliveries, setDeliveries] = useState(initialDeliveries)
  const [stockMoves, setStockMoves] = useState<StockMove[]>([])
  const [productionRecords, setProductionRecords] = useState<ProductionRecord[]>([])
  const [expenses, setExpenses] = useState(initialExpenses)
  const me = currentUser.name.split(' ')[0]

  const customerOpenBills = (id: string) => {
    const c = customers.find((x) => x.id === id)
    return c ? customerBills(c, sales, payments) : []
  }

  const value: Trade = {
    sales,
    purchases,
    payments,
    customers,
    suppliers,
    customerOpenBills,
    customerBalance: (id) => sumLeft(customerOpenBills(id)),
    customerStatement: (id) => {
      const c = customers.find((x) => x.id === id)
      return c ? customerStatement(c, sales, payments) : []
    },
    orders,
    deliveries,
    stockMoves,
    stockOf: (item, base) => base + stockMoves.filter((m) => m.item === item).reduce((n, m) => n + m.qty, 0),
    receiveDelivery(ref, delivered, sentBack, note, by) {
      const order = orders.find((o) => o.ref === ref)
      if (!order) return
      const intoStore = (delivered - sentBack) * order.perUnit
      setOrders((list) => list.filter((o) => o.ref !== ref))
      setDeliveries((list) => [{ ...order, qty: delivered, received: '09/10 13:58', by, sentBack, note }, ...list])
      setStockMoves((list) => [...list, { item: order.item, qty: intoStore, type: 'received', source: `Delivery · ${ref}` }])
    },
    addStockMoves: (moves) => setStockMoves((list) => [...list, ...moves]),
    expenses,
    addExpense: (expense) => setExpenses((list) => [expense, ...list]),
    productionRecords,
    addProductionRecord(record) {
      setProductionRecords((list) => [record, ...list])
      const source = `Pen ${record.penId} entry · ${record.recordedBy}`
      setStockMoves((list) => [
        ...list,
        ...(record.feedBags > 0 ? [{ item: record.feedType, qty: -record.feedBags, type: 'used' as const, source }] : []),
        ...record.medications.map((m) => ({ item: m.medication, qty: -m.qty, type: 'used' as const, source })),
      ])
    },
    addCustomer: (c) => setCustomers((list) => [...list, c]),
    addSupplier: (s) => setSuppliers((list) => [...list, s]),
    supplierBalance: (id) => supplierBalance(id, purchases, payments),
    supplierOpenBills: (id) => supplierBills(id, purchases, payments),
    supplierStatement: (id) => supplierStatement(id, purchases, payments),
    purchasePaid: (ref) => {
      const p = purchases.find((x) => x.ref === ref)
      return p ? (supplierPurchases(p.supplierId, purchases, payments).find((x) => x.purchase.ref === ref)?.paid ?? 0) : 0
    },

    approveSale(receipt, by) {
      setSales((list) =>
        list.map((s) =>
          s.receipt === receipt
            ? { ...s, pendingApproval: false, approvedAt: '16:51', history: [{ title: `Approved by ${by}`, detail: 'Receipt released', time: '16:51' }, ...s.history] }
            : s,
        ),
      )
    },
    rejectSale(receipt) {
      setSales((list) => list.filter((s) => s.receipt !== receipt))
    },
    addSale(sale) {
      setSales((list) => [sale, ...list])
    },
    recordSalePayment(receipt, amount, method) {
      setSales((list) =>
        list.map((s) =>
          s.receipt === receipt
            ? { ...s, paid: s.paid + amount, method, history: [{ title: 'Payment recorded', detail: `₦${amount.toLocaleString('en-NG')} · ${method}`, time: 'now' }, ...s.history] }
            : s,
        ),
      )
    },
    addPurchase(purchase) {
      setPurchases((list) => [purchase, ...list])
    },
    recordPayment(p) {
      const bills = p.direction === 'in' ? customerOpenBills(p.partyId) : supplierBills(p.partyId, purchases, payments)
      const allocation = allocate(bills, p.amount)

      // Payments are ledger entries; bills, balances and purchase histories are derived from them.

      const cleared = describeAllocation(allocation) || 'Held as credit'
      setPayments((list) => {
        const prefix = p.direction === 'in' ? 'P-' : 'PP-'
        const next = Math.max(...list.filter((x) => x.ref.startsWith(prefix) && !(prefix === 'P-' && x.ref.startsWith('PP-'))).map((x) => Number(x.ref.match(/\d+$/)![0]))) + 1
        return [{ ref: `${prefix}${String(next).padStart(4, '0')}`, ...p, cleared, by: me }, ...list]
      })
      return cleared
    },
  }

  return <TradeContext.Provider value={value}>{children}</TradeContext.Provider>
}
