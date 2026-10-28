import { GO_LIVE, type Customer } from './customers'
import type { Payment } from './payments'
import { totalOf, type Purchase } from './purchases'
import { amountOf, products, type Sale } from './sales'

// Balances are always derived — never stored or typed.

export const TODAY_ISO = '2026-10-09'

/** An unpaid (or part-paid) charge. */
export type Bill = { ref: string; date: string; left: number }

/** "09/10 15:10" → "2026-10-09" */
export const saleISODate = (s: Sale) => `2026-${s.date.slice(3, 5)}-${s.date.slice(0, 2)}`

export function daysBetween(fromISO: string, toISO = TODAY_ISO) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000)
}

export type StatementLine = {
  date: string
  entry: string
  ref: string | null
  charged: number | null
  paid: number | null
  balance: number
}

type Charge = { ref: string; date: string; entry: string; amount: number; paidAtSale: number }

function charges(c: Customer, sales: Sale[]): Charge[] {
  const list: Charge[] = []
  if (c.opening) list.push({ ref: 'Opening balance', date: GO_LIVE, entry: 'Opening balance', amount: c.opening, paidAtSale: 0 })
  for (const s of c.olderSales) list.push({ ref: s.ref, date: s.date, entry: s.label, amount: s.amount, paidAtSale: s.paid })
  for (const s of sales) {
    if (s.customerId !== c.id || s.pendingApproval) continue
    const p = products.find((x) => x.id === s.productId)!
    list.push({ ref: s.receipt, date: saleISODate(s), entry: `Sale · ${p.kind === 'Eggs' ? 'Eggs' : p.short} ${s.qty} ${p.unitShort} × ₦${s.price.toLocaleString('en-NG')}`, amount: amountOf(s), paidAtSale: s.paid })
  }
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

const customerPayments = (c: Customer, payments: Payment[]) =>
  payments.filter((p) => p.direction === 'in' && p.partyId === c.id).sort((a, b) => a.date.localeCompare(b.date))

/** Open bills, oldest first: each sale's own payment applies to it; other payments clear the oldest first. */
export function customerBills(c: Customer, sales: Sale[], payments: Payment[]): Bill[] {
  const bills = charges(c, sales).map((ch) => ({ ref: ch.ref, date: ch.date, left: ch.amount - ch.paidAtSale }))
  for (const p of customerPayments(c, payments)) {
    let rest = p.amount
    for (const b of bills) {
      if (rest <= 0) break
      const applied = Math.min(b.left, rest)
      b.left -= applied
      rest -= applied
    }
  }
  return bills.filter((b) => b.left > 0)
}

export const sumLeft = (bills: Bill[]) => bills.reduce((n, b) => n + b.left, 0)

/** Every sale and payment with a running balance. */
export function customerStatement(c: Customer, sales: Sale[], payments: Payment[]): StatementLine[] {
  type Row = Omit<StatementLine, 'balance'>
  const rows: Row[] = []
  for (const ch of charges(c, sales)) {
    if (ch.ref === 'Opening balance') rows.push({ date: ch.date, entry: 'Opening balance', ref: null, charged: null, paid: null })
    else rows.push({ date: ch.date, entry: ch.entry, ref: ch.ref, charged: ch.amount, paid: ch.paidAtSale })
  }
  for (const p of customerPayments(c, payments)) {
    const how = { cash: 'Cash', transfer: 'Transfer', POS: 'POS' }[p.method]
    rows.push({ date: p.date, entry: `Payment received · ${how}`, ref: p.ref, charged: null, paid: p.amount })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.entry === 'Opening balance' ? -1 : 0))
  let balance = c.opening
  return rows.map((r) => {
    if (r.entry !== 'Opening balance') balance += (r.charged ?? 0) - (r.paid ?? 0)
    return { ...r, balance }
  })
}

export type Aging = { current: number; days31to60: number; over60: number }

export function aging(bills: Bill[]): Aging {
  const a = { current: 0, days31to60: 0, over60: 0 }
  for (const b of bills) {
    const d = daysBetween(b.date)
    if (d > 60) a.over60 += b.left
    else if (d > 30) a.days31to60 += b.left
    else a.current += b.left
  }
  return a
}

type PurchaseState = { purchase: Purchase; paid: number }

/** Each purchase with what has been paid on it: at purchase, then payments clearing the oldest first. */
export function supplierPurchases(supplierId: string, purchases: Purchase[], payments: Payment[]): PurchaseState[] {
  const list = purchases
    .filter((p) => p.supplierId === supplierId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ purchase: p, paid: p.paidAtPurchase }))
  const outgoing = payments.filter((p) => p.direction === 'out' && p.partyId === supplierId).sort((a, b) => a.date.localeCompare(b.date))
  for (const pay of outgoing) {
    let rest = pay.amount
    for (const x of list) {
      if (rest <= 0) break
      const left = totalOf(x.purchase) - x.paid
      if (left <= 0) continue
      const applied = Math.min(left, rest)
      x.paid += applied
      rest -= applied
    }
  }
  return list
}

/** What we owe a supplier; negative means they hold credit for us. */
export function supplierBalance(supplierId: string, purchases: Purchase[], payments: Payment[]) {
  const bought = purchases.filter((p) => p.supplierId === supplierId).reduce((n, p) => n + totalOf(p) - p.paidAtPurchase, 0)
  const paid = payments.filter((p) => p.direction === 'out' && p.partyId === supplierId).reduce((n, p) => n + p.amount, 0)
  return bought - paid
}

export function supplierBills(supplierId: string, purchases: Purchase[], payments: Payment[]): Bill[] {
  return supplierPurchases(supplierId, purchases, payments)
    .filter((x) => totalOf(x.purchase) > x.paid)
    .map((x) => ({ ref: x.purchase.ref, date: x.purchase.date, left: totalOf(x.purchase) - x.paid }))
}

/** Every purchase and payment with a running "we owe" balance. */
export function supplierStatement(supplierId: string, purchases: Purchase[], payments: Payment[]): StatementLine[] {
  type Row = Omit<StatementLine, 'balance'>
  const rows: Row[] = [{ date: GO_LIVE, entry: 'Opening balance', ref: null, charged: null, paid: null }]
  for (const p of purchases.filter((x) => x.supplierId === supplierId)) {
    rows.push({ date: p.date, entry: `Purchase · ${p.item} ${p.qty.toLocaleString('en-NG')} ${p.unit} × ₦${p.price.toLocaleString('en-NG')}`, ref: p.ref, charged: totalOf(p), paid: p.paidAtPurchase || null })
  }
  for (const p of payments.filter((x) => x.direction === 'out' && x.partyId === supplierId)) {
    const how = { cash: 'cash', transfer: 'transfer', POS: 'POS' }[p.method]
    rows.push({ date: p.date, entry: `Payment made · ${how}`, ref: p.ref, charged: null, paid: p.amount })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.charged !== null ? -1 : 1))
  let balance = 0
  return rows.map((r) => {
    balance += (r.charged ?? 0) - (r.paid ?? 0)
    return { ...r, balance }
  })
}

export type Allocation = { ref: string; date: string; before: number; applied: number }

/** Spread a payment over bills, oldest first. */
export function allocate(bills: Bill[], amount: number): Allocation[] {
  const out: Allocation[] = []
  let rest = amount
  for (const b of bills) {
    if (rest <= 0) break
    const applied = Math.min(b.left, rest)
    out.push({ ref: b.ref, date: b.date, before: b.left, applied })
    rest -= applied
  }
  return out
}

export function describeAllocation(a: Allocation[]) {
  return a.map((x) => `${x.ref} ${x.applied >= x.before ? 'in full' : 'part'}`).join(' · ')
}
