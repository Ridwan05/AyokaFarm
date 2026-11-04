import type { PaymentMethod } from './sales'

// Payments (P-D13): money received or paid outside a sale or purchase, loaded from Supabase (remote.ts).

/** One payment in or out. */
export type Payment = {
  ref: string
  /** ISO date */
  date: string
  direction: 'in' | 'out'
  /** Customer id (in) or supplier id (out). Refs: P- for money in, PP- for money out. */
  partyId: string
  method: PaymentMethod
  reference: string | null
  amount: number
  cleared: string
  /** The sale this payment was taken for; it is applied to that sale first. */
  saleRef?: string
  by: string
}
