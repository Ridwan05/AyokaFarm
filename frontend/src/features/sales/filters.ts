import { useState } from 'react'
import type { Customer } from '../../data/customers'
import { products, THIS_WEEK_FROM_DAY, TODAY, type Sale } from '../../data/sales'

export const PERIODS = ['Today', 'This week', 'This month'] as const
export type Period = (typeof PERIODS)[number]
export const PRODUCT_FILTERS = ['All products', 'Eggs', 'Birds', 'Droppings'] as const

const day = (s: Sale) => Number(s.date.slice(0, 2))

export function useSalesFilter(sales: Sale[], customers: Customer[], initialPeriod: Period) {
  const [period, setPeriod] = useState<Period>(initialPeriod)
  const [product, setProduct] = useState<(typeof PRODUCT_FILTERS)[number]>('All products')
  const [customer, setCustomer] = useState('All customers')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const visible = sales
    .filter((s) => (period === 'Today' ? s.date.startsWith(TODAY) : period === 'This week' ? day(s) >= THIS_WEEK_FROM_DAY : true))
    .filter((s) => product === 'All products' || products.find((p) => p.id === s.productId)?.kind === product)
    .filter((s) => customer === 'All customers' || customers.find((c) => c.id === s.customerId)?.name === customer)
    .filter((s) => {
      if (!q) return true
      const name = customers.find((c) => c.id === s.customerId)?.name ?? 'One-off buyer'
      return s.receipt.toLowerCase().includes(q) || name.toLowerCase().includes(q)
    })

  return {
    visible,
    period, setPeriod,
    product, setProduct,
    customer, setCustomer,
    customerOptions: ['All customers', ...customers.map((c) => c.name)],
    query, setQuery,
  }
}
