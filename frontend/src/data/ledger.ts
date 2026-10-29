import type { Customer } from './customers'
import type { Expense } from './expenses'
import { farmSettings } from './farmSettings'
import { farmTodayISO } from './session'
import type { Payment } from './payments'
import { totalOf, type Purchase } from './purchases'
import { amountOf, products, type Sale } from './sales'
import type { Supplier } from './suppliers'

// Balances are always derived — never stored or typed.

export const TODAY_ISO = farmTodayISO()

/** An unpaid (or part-paid) charge. */
export type Bill = { ref: string; date: string; left: number }

/** Opening balances are dated at go-live (or the start of the records if it isn't set). */
const goLive = () => farmSettings.goLiveDate ?? '2000-01-01'

/** "09/10 15:10" → ISO date; falls back to this year for sales without one. */
export const saleISODate = (s: Sale) => s.iso ?? `${TODAY_ISO.slice(0, 4)}-${s.date.slice(3, 5)}-${s.date.slice(0, 2)}`

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
  if (c.opening) list.push({ ref: 'Opening balance', date: goLive(), entry: 'Opening balance', amount: c.opening, paidAtSale: 0 })
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

/**
 * Open bills, oldest first: each sale's own payment applies to it; a payment taken for a particular
 * sale clears that sale first; anything left (and general payments) clears the oldest first.
 */
export function customerBills(c: Customer, sales: Sale[], payments: Payment[]): Bill[] {
  const bills = charges(c, sales).map((ch) => ({ ref: ch.ref, date: ch.date, left: ch.amount - ch.paidAtSale }))
  for (const p of customerPayments(c, payments)) {
    let rest = p.amount
    const target = p.saleRef ? bills.find((b) => b.ref === p.saleRef) : undefined
    if (target) {
      const applied = Math.min(target.left, rest)
      target.left -= applied
      rest -= applied
    }
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

/** Everything a supplier has billed us: opening balance, purchases, and expenses booked to them. */
export type SupplierBooks = { purchases: Purchase[]; expenses: Expense[]; payments: Payment[] }
type SupplierCharge = { ref: string; date: string; entry: string; amount: number; paidAtStart: number }

function supplierCharges(s: Supplier, { purchases, expenses }: SupplierBooks): SupplierCharge[] {
  const list: SupplierCharge[] = []
  if (s.opening) list.push({ ref: 'Opening balance', date: goLive(), entry: 'Opening balance', amount: s.opening, paidAtStart: 0 })
  for (const p of purchases.filter((x) => x.supplierId === s.id)) {
    list.push({ ref: p.ref, date: p.date, entry: `Purchase · ${p.item} ${p.qty.toLocaleString('en-NG')} ${p.unit} × ₦${p.price.toLocaleString('en-NG')}`, amount: totalOf(p), paidAtStart: p.paidAtPurchase })
  }
  for (const e of expenses.filter((x) => x.supplierId === s.id)) {
    list.push({ ref: e.id, date: e.date, entry: `Expense · ${e.description}`, amount: e.amount, paidAtStart: e.amountPaid ?? e.amount })
  }
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

const supplierPaymentsOf = (id: string, payments: Payment[]) =>
  payments.filter((p) => p.direction === 'out' && p.partyId === id).sort((a, b) => a.date.localeCompare(b.date))

/** Each charge with what has been paid on it: at the time, then payments clearing the oldest first. */
export function supplierCharged(s: Supplier, books: SupplierBooks) {
  const list = supplierCharges(s, books).map((c) => ({ ...c, paid: c.paidAtStart }))
  for (const pay of supplierPaymentsOf(s.id, books.payments)) {
    let rest = pay.amount
    for (const x of list) {
      if (rest <= 0) break
      const left = x.amount - x.paid
      if (left <= 0) continue
      const applied = Math.min(left, rest)
      x.paid += applied
      rest -= applied
    }
  }
  return list
}

/** What we owe a supplier; negative means they hold credit for us. */
export function supplierBalance(s: Supplier, books: SupplierBooks) {
  const owed = supplierCharges(s, books).reduce((n, c) => n + c.amount - c.paidAtStart, 0)
  return owed - supplierPaymentsOf(s.id, books.payments).reduce((n, p) => n + p.amount, 0)
}

export function supplierBills(s: Supplier, books: SupplierBooks): Bill[] {
  return supplierCharged(s, books)
    .filter((x) => x.amount > x.paid)
    .map((x) => ({ ref: x.ref, date: x.date, left: x.amount - x.paid }))
}

/** Every charge and payment with a running "we owe" balance. */
export function supplierStatement(s: Supplier, books: SupplierBooks): StatementLine[] {
  type Row = Omit<StatementLine, 'balance'>
  const rows: Row[] = []
  for (const c of supplierCharges(s, books)) {
    if (c.ref === 'Opening balance') rows.push({ date: c.date, entry: 'Opening balance', ref: null, charged: null, paid: null })
    else rows.push({ date: c.date, entry: c.entry, ref: c.ref, charged: c.amount, paid: c.paidAtStart || null })
  }
  for (const p of supplierPaymentsOf(s.id, books.payments)) {
    const how = { cash: 'cash', transfer: 'transfer', POS: 'POS' }[p.method]
    rows.push({ date: p.date, entry: `Payment made · ${how}`, ref: p.ref, charged: null, paid: p.amount })
  }
  const rank = (r: Row) => (r.entry === 'Opening balance' ? 0 : r.charged !== null ? 1 : 2)
  rows.sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b))
  let balance = s.opening ?? 0
  return rows.map((r) => {
    if (r.entry !== 'Opening balance') balance += (r.charged ?? 0) - (r.paid ?? 0)
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
