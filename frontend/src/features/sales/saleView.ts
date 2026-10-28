import type { Tone } from '../../components/ui/Badge'
import { ONE_OFF, type Customer } from '../../data/customers'
import { products, saleStatus, type Sale, type SaleStatus } from '../../data/sales'

export const statusBadge: Record<SaleStatus, { tone: Tone; label: string }> = {
  'needs-approval': { tone: 'warning', label: 'Needs approval' },
  'on-credit': { tone: 'neutral', label: 'On credit' },
  'part-paid': { tone: 'warning', label: 'Part-paid' },
  paid: { tone: 'success', label: 'Paid' },
}

export const productOf = (s: Sale) => products.find((p) => p.id === s.productId)!

export function customerView(s: Sale, customers: Customer[]) {
  const c = customers.find((x) => x.id === s.customerId)
  if (!c) return { name: ONE_OFF.name, initials: ONE_OFF.initials, subtitle: 'Paid in full', customer: undefined }
  return { name: c.name, initials: c.initials, subtitle: `Regular · ${c.buys}`, customer: c }
}

export const isNeedsApproval = (s: Sale) => saleStatus(s) === 'needs-approval'
