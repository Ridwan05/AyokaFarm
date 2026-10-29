import type { PaymentMethod } from './sales'

// Expenses come from Supabase (remote.ts). Categories are the expense_categories rows (Settings › Lists).

export type ExpenseCategory = string

export type Expense = {
  id: string
  /** ISO date */
  date: string
  category: ExpenseCategory
  description: string
  /** null = general overhead, shared across pens by bird-days */
  pen: number | null
  supplierId: string | null
  amount: number
  /** Paid so far; a supplier expense paid in part is owed to that supplier. Defaults to the full amount. */
  amountPaid?: number
  method: PaymentMethod
  receipt: boolean
  /** Storage path of the receipt photo or PDF (bucket "receipts"). */
  receiptPath?: string | null
  addedBy: string
}
