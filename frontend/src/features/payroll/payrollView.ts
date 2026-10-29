import type { Employee, Payroll, PayrollLine, PayslipItem } from '../../data/payroll'

// Small helpers shared by the payroll screen, its drawers and the payslip print page.

export const ITEM_KIND_LABEL: Record<PayslipItem['kind'], string> = {
  earning: 'Extra pay',
  deduction: 'Deduction',
  loan: 'Advance / loan repayment',
  statutory: 'Statutory',
}

export const METHOD_LABEL = { cash: 'Cash', transfer: 'Transfer', pos: 'POS' } as const

/** Days in the month that starts on period (YYYY-MM-01). */
export function daysInMonth(period: string) {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** "Full month", "18 of 30 days", "12 days", "3 weeks". */
export function workedLabel(basis: Employee['pay_basis'], units: number, period: string) {
  if (basis === 'monthly') {
    const days = daysInMonth(period)
    const n = Math.round(units * days)
    return n >= days ? 'Full month' : `${n} of ${days} days`
  }
  const n = Number(units.toFixed(2))
  const word = basis === 'weekly' ? 'week' : 'day'
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Item totals for a line: extras, loan repayments and other deductions. */
export function lineParts(items: PayslipItem[]) {
  const sum = (k: PayslipItem['kind'][]) => items.filter((i) => k.includes(i.kind)).reduce((n, i) => n + Number(i.amount), 0)
  return { extras: sum(['earning']), loans: sum(['loan']), other: sum(['deduction', 'statutory']) }
}

/**
 * What's left on a loan after a given payslip: amount − repayments on approved months up to this
 * one (and this payslip's own repayment, even while the month is a draft).
 */
export function loanLeftAfter(data: Payroll, loanId: number, line: PayrollLine) {
  const loan = data.loans.find((l) => l.id === loanId)
  if (!loan) return null
  const thisRun = data.runs.find((r) => r.id === line.run_id)
  if (!thisRun) return null
  const repaid = data.items
    .filter((i) => i.loan_id === loanId)
    .reduce((n, i) => {
      const l = data.lines.find((x) => x.id === i.line_id)
      const r = l && data.runs.find((x) => x.id === l.run_id)
      if (!r || r.period > thisRun.period) return n
      return r.status === 'approved' || r.id === thisRun.id ? n + Number(i.amount) : n
    }, 0)
  return Number(loan.amount) - repaid
}
