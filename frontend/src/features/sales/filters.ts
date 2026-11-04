import { useState } from 'react'
import type { Customer } from '../../data/customers'
import { saleISODate } from '../../data/ledger'
import { inRange, period as periodRange, type Range } from '../../data/metrics'
import { amountOf, products, type Sale } from '../../data/sales'
import type { Cell } from '../../lib/export'

/** The periods the sales list can show. */
export const PERIODS = ['Today', 'This week', 'This month'] as const
/** One of PERIODS. */
export type Period = (typeof PERIODS)[number]
/** The product filter options; "All products" shows every kind. */
export const PRODUCT_FILTERS = ['All products', 'Eggs', 'Birds', 'Droppings'] as const

/** The dates a period covers ("This week" starts on Monday). */
export const rangeOf = (p: Period): Range => periodRange(p === 'Today' ? 'today' : p === 'This week' ? 'week' : 'month')

/** Filter state for a sales list (period, product, customer, search) and the sales that pass it. */
export function useSalesFilter(sales: Sale[], customers: Customer[], initialPeriod: Period) {
  const [period, setPeriod] = useState<Period>(initialPeriod)
  const [product, setProduct] = useState<(typeof PRODUCT_FILTERS)[number]>('All products')
  const [customer, setCustomer] = useState('All customers')
  const [query, setQuery] = useState('')

  const range = rangeOf(period)
  const q = query.trim().toLowerCase()
  const visible = sales
    .filter((s) => inRange(saleISODate(s), range))
    .filter((s) => product === 'All products' || products.find((p) => p.id === s.productId)?.kind === product)
    .filter((s) => customer === 'All customers' || customers.find((c) => c.id === s.customerId)?.name === customer)
    .filter((s) => {
      if (!q) return true
      // Sales without a customer record are searchable as "One-off buyer".
      const name = customers.find((c) => c.id === s.customerId)?.name ?? 'One-off buyer'
      return s.receipt.toLowerCase().includes(q) || name.toLowerCase().includes(q)
    })

  return {
    visible,
    range,
    period, setPeriod,
    product, setProduct,
    customer, setCustomer,
    customerOptions: ['All customers', ...customers.map((c) => c.name)],
    query, setQuery,
  }
}

/** Column headings for the sales spreadsheet; matches saleCsvRows. */
export const SALES_CSV_HEADER = ['Receipt', 'Date', 'Time', 'Customer', 'Product', 'Quantity', 'Unit', 'Price (₦)', 'Total (₦)', 'Paid at sale (₦)', 'Method', 'Status', 'Recorded by']

/** One spreadsheet row per sale, for downloadCsv. */
export function saleCsvRows(sales: Sale[], customers: Customer[]): Cell[][] {
  return sales.map((s) => {
    const p = products.find((x) => x.id === s.productId)
    return [
      s.receipt,
      saleISODate(s),
      // The time is the part of the shown date after the space, when there is one.
      s.date.split(' ')[1] ?? '',
      customers.find((c) => c.id === s.customerId)?.name ?? 'One-off buyer',
      p?.name ?? s.productId,
      s.qty,
      p?.unit ?? '',
      s.price,
      amountOf(s),
      s.paid,
      s.method ?? '',
      s.pendingApproval ? 'Waiting for approval' : s.paid >= amountOf(s) ? 'Paid' : s.paid > 0 ? 'Part-paid' : 'On credit',
      s.recordedBy,
    ]
  })
}
