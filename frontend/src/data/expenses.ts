import type { PaymentMethod } from './sales'

// Mock expenses for October, matching P-D12 · Expenses (category totals add up to ₦1.06M).

export const expenseCategories = ['Labour', 'Fuel & power', 'Vet services', 'Transport', 'Repairs', 'Utilities', 'Equipment'] as const
export type ExpenseCategory = (typeof expenseCategories)[number]

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
  addedBy: string
}

export const initialExpenses: Expense[] = [
  { id: 'e11', date: '2026-10-08', category: 'Fuel & power', description: 'Diesel for generator, 50 L', pen: null, supplierId: null, amount: 62000, method: 'cash', receipt: true, addedBy: 'Bayo' },
  { id: 'e10', date: '2026-10-07', category: 'Equipment', description: 'Plastic egg crates × 20', pen: null, supplierId: 'ibadan-crates', amount: 30000, method: 'transfer', receipt: true, addedBy: 'Funmi' },
  { id: 'e09', date: '2026-10-06', category: 'Vet services', description: 'Vaccination visit, Gumboro', pen: 6, supplierId: null, amount: 45000, method: 'transfer', receipt: true, addedBy: 'Emeka' },
  { id: 'e08', date: '2026-10-05', category: 'Transport', description: 'Feed delivery from Greenfield', pen: null, supplierId: null, amount: 24000, method: 'cash', receipt: false, addedBy: 'Funmi' },
  { id: 'e07', date: '2026-10-04', category: 'Repairs', description: 'Roof sheets replaced', pen: 4, supplierId: null, amount: 46000, method: 'cash', receipt: true, addedBy: 'Emeka' },
  { id: 'e06', date: '2026-10-03', category: 'Repairs', description: 'Drinker line leak fixed', pen: 2, supplierId: null, amount: 18000, method: 'cash', receipt: true, addedBy: 'Emeka' },
  { id: 'e05', date: '2026-10-02', category: 'Fuel & power', description: 'Diesel for generator, 100 L', pen: null, supplierId: null, amount: 124000, method: 'transfer', receipt: true, addedBy: 'Bayo' },
  { id: 'e04', date: '2026-10-02', category: 'Transport', description: 'Egg deliveries, last week of September', pen: null, supplierId: null, amount: 48000, method: 'cash', receipt: false, addedBy: 'Funmi' },
  { id: 'e03', date: '2026-10-02', category: 'Utilities', description: 'Electricity token', pen: null, supplierId: null, amount: 48000, method: 'transfer', receipt: true, addedBy: 'Funmi' },
  { id: 'e02', date: '2026-10-01', category: 'Vet services', description: 'Vet visit, coccidiosis check', pen: 5, supplierId: null, amount: 58000, method: 'transfer', receipt: true, addedBy: 'Emeka' },
  { id: 'e01', date: '2026-10-01', category: 'Vet services', description: 'Vet retainer, October', pen: null, supplierId: null, amount: 17000, method: 'transfer', receipt: false, addedBy: 'Adeola' },
  { id: 'e00', date: '2026-10-01', category: 'Labour', description: 'September wages, 8 staff', pen: null, supplierId: null, amount: 540000, method: 'transfer', receipt: false, addedBy: 'Adeola' },
]

/** Shown in the "Where it goes" card. */
export const vsLastMonth = '−4%'
