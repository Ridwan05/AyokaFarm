'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '../lib/supabase/client'
import type { Database } from '../lib/supabase/database.types'

// Payroll is loaded on demand by the payroll screens, not with the rest of the farm's records, so
// salaries only travel when someone opens them. Row-level security decides what comes back:
// payroll staff get everything; everyone else only their own employee record, loans and payslips.

type Tables = Database['public']['Tables']
export type Employee = Tables['employees']['Row']
export type Loan = Tables['employee_loans']['Row']
export type LoanBalance = Database['public']['Views']['employee_loan_balances']['Row']
export type PayrollRun = Tables['payroll_runs']['Row']
export type PayrollLine = Tables['payroll_lines']['Row']
export type PayslipItem = Tables['payslip_items']['Row']

export type Payroll = {
  employees: Employee[]
  loans: Loan[]
  balances: LoanBalance[]
  runs: PayrollRun[]
  lines: PayrollLine[]
  items: PayslipItem[]
}

const empty: Payroll = { employees: [], loans: [], balances: [], runs: [], lines: [], items: [] }

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string) {
  const { data, error } = await q
  if (error) throw new Error(`Couldn’t load ${what}: ${error.message}`)
  return data ?? []
}

export async function loadPayroll(db = createClient()): Promise<Payroll> {
  const [employees, loans, balances, runs, lines, items] = await Promise.all([
    rows(db.from('employees').select('*').order('full_name'), 'employees'),
    rows(db.from('employee_loans').select('*').order('issued_on', { ascending: false }).order('id', { ascending: false }), 'advances and loans'),
    rows(db.from('employee_loan_balances').select('*'), 'loan balances'),
    rows(db.from('payroll_runs').select('*').order('period', { ascending: false }), 'payroll months'),
    rows(db.from('payroll_lines').select('*').order('id').range(0, 9999), 'payslips'),
    rows(db.from('payslip_items').select('*').order('id').range(0, 19999), 'payslip items'),
  ])
  return { employees, loans, balances, runs, lines, items }
}

/** Payroll data for a screen, with reload() and save() that toasts errors and reloads. */
export function usePayroll() {
  const db = useMemo(() => createClient(), [])
  const [data, setData] = useState<Payroll | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await loadPayroll(db))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [db])

  useEffect(() => {
    // Loading from Supabase (an external system) on open, so setting state here is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  /** Run a write; on error show it, otherwise reload. Resolves true when it saved. */
  const save = useCallback(
    async (run: (database: typeof db) => PromiseLike<{ error: { message: string } | null }>) => {
      const { error: e } = await run(db)
      if (e) {
        toast.error(/row-level security|permission denied|42501/i.test(e.message) ? 'You don’t have permission to do that.' : e.message.replace(/^.*?ERROR:\s*/, ''))
        return false
      }
      await reload()
      return true
    },
    [db, reload],
  )

  return { data: data ?? empty, loaded: data !== null, error, reload, save, db }
}

// ── Money helpers ───────────────────────────────────────────────────

export const monthLabel = (period: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period.slice(0, 7)}-01T00:00:00Z`))

/** First day of the month containing iso. */
export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`

/** First day of the month after iso. */
export function nextMonth(iso: string) {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export const PAY_BASIS_LABEL: Record<Employee['pay_basis'], string> = { monthly: 'Monthly salary', daily: 'Daily rate', weekly: 'Weekly rate' }
export const PAY_UNIT: Record<Employee['pay_basis'], string> = { monthly: 'a month', daily: 'a day', weekly: 'a week' }
export const LOAN_STATUS_LABEL: Record<Loan['status'], string> = { pending: 'Waiting for approval', active: 'Being repaid', repaid: 'Repaid', cancelled: 'Cancelled' }

export const explainPayroll = {
  basic: () => 'Monthly staff: salary × the share of the month they were employed. Casuals: days or weeks worked × their rate.',
  gross: () => 'Basic pay + extras (overtime, bonus).',
  deductions: () => 'Advance and loan repayments + other deductions (and statutory lines when used).',
  net: () => 'Gross pay − deductions: what the person is paid.',
  loanBalance: () => 'Amount lent − repayments taken from approved payslips. Interest-free.',
  monthsLeft: () => 'Balance ÷ the monthly repayment, rounded up.',
  loanRepayment: () => 'This month’s repayment: the monthly amount, or what’s left if that’s less. Change or remove it on the draft to skip a month.',
  posting: () => 'Approving posts one Labour expense for total gross pay. Like other general costs it’s shared across pens by bird-days. Advances and loans aren’t expenses — they’re owed back.',
}
