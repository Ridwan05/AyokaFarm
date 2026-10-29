import type { FinanceEntry, FixedAsset } from '../../data/finance'
import { addDays } from '../../data/metrics'

// Plain labels and small helpers shared by the Finance screens.

export const CATEGORY_LABEL: Record<FixedAsset['category'], string> = {
  land: 'Land',
  buildings: 'Poultry houses and structures',
  equipment: 'Equipment',
  machinery: 'Machinery',
  vehicles: 'Vehicles',
}

export const KIND_LABEL: Record<FinanceEntry['kind'], string> = {
  opening_cash: 'Opening balance',
  capital_in: 'Owner put money in',
  drawing: 'Owner took money out',
  loan_received: 'Loan received',
  loan_repaid: 'Loan repayment',
  other_income: 'Other income',
}

/** Kinds recorded from Capital & loans (opening balances have their own tab). */
export const ENTRY_KINDS = ['capital_in', 'drawing', 'loan_received', 'loan_repaid', 'other_income'] as const

/** Money coming in (+) or going out (−) of cash/bank for an entry. */
export const entrySign = (kind: FinanceEntry['kind']) => (kind === 'drawing' || kind === 'loan_repaid' ? -1 : 1)

export const accountLabel = (a: string | null | undefined) => (a === 'bank' ? 'Bank' : a === 'cash' ? 'Cash' : '—')

/** "5 years", "18 months", "—" */
export function lifeLabel(months: number | null) {
  if (!months) return '—'
  if (months % 12 === 0) return `${months / 12} ${months === 12 ? 'year' : 'years'}`
  return `${months} months`
}

/** The day before go-live: when opening balances are dated. */
export const openingDay = (goLive: string) => addDays(goLive, -1)

export const num = (v: string) => Number(v.replace(/,/g, '')) || 0
