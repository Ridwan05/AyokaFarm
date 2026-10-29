import type { Tone } from '../../components/ui/Badge'
import { PAY_UNIT, type Employee, type Loan, type LoanBalance, type Payroll } from '../../data/payroll'
import { formatNaira } from '../../lib/format'

// Small helpers shared by Employees, Employee detail and My pay.

/** "₦85,000 a month", "₦3,000 a day". */
export const payText = (e: Pick<Employee, 'pay_rate' | 'pay_basis'>) => `${formatNaira(Number(e.pay_rate))} ${PAY_UNIT[e.pay_basis]}`

export function employeeStatus(e: Employee): { tone: Tone; label: string } {
  if (e.left_on) return { tone: 'neutral', label: 'Left' }
  if (!e.is_active) return { tone: 'neutral', label: 'Inactive' }
  return { tone: 'success', label: 'Active' }
}

export const isWorking = (e: Employee) => e.is_active && !e.left_on

/** What an employee still owes on advances and loans being repaid. */
export const owedBy = (balances: LoanBalance[], employeeId: number) =>
  balances.filter((b) => b.employee_id === employeeId && b.status === 'active').reduce((n, b) => n + Math.max(0, Number(b.balance ?? 0)), 0)

export const balanceOf = (balances: LoanBalance[], loanId: number) => balances.find((b) => b.loan_id === loanId)

export const LOAN_KIND_LABEL: Record<Loan['kind'], string> = { advance: 'Salary advance', loan: 'Loan' }

export function loanTone(status: Loan['status']): Tone {
  return status === 'pending' ? 'warning' : status === 'active' ? 'info' : status === 'repaid' ? 'success' : 'neutral'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Nov 2026" from any date in the month. */
export const shortMonth = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

/** The month n months after the month of iso, as YYYY-MM-01. */
export function addMonths(iso: string, n: number) {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7)) - 1 + n
  return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, '0')}-01`
}

/** "₦20,000 a month, Nov 2026 – Apr 2027 (6 months)" for an amount repaid from first month. */
export function scheduleText(amount: number, monthly: number, firstMonth: string) {
  if (!(amount > 0) || !(monthly > 0) || !firstMonth) return ''
  const months = Math.ceil(amount / monthly)
  const last = addMonths(firstMonth, months - 1)
  const lastAmount = amount - monthly * (months - 1)
  const tail = months > 1 && lastAmount !== monthly ? ` (last month ${formatNaira(lastAmount)})` : ''
  return months === 1
    ? `${formatNaira(amount)} off the ${shortMonth(firstMonth)} payslip`
    : `${formatNaira(monthly)} a month, ${shortMonth(firstMonth)} – ${shortMonth(last)} · ${months} months${tail}`
}

/** Next repayment on a running loan: this month's amount and the month it comes off. */
export function nextRepayment(b: LoanBalance, todayIso: string) {
  const balance = Number(b.balance ?? 0)
  if (b.status !== 'active' || balance <= 0 || !b.first_month) return null
  const thisMonth = `${todayIso.slice(0, 7)}-01`
  const month = b.first_month > thisMonth ? b.first_month : thisMonth
  return { month, amount: Math.min(Number(b.monthly_repayment ?? 0), balance) }
}

/** Payslips for one employee from approved months, newest first. */
export function approvedPayslips(data: Payroll, employeeId: number) {
  const approved = new Map(data.runs.filter((r) => r.status === 'approved').map((r) => [r.id, r]))
  return data.lines
    .filter((l) => l.employee_id === employeeId && approved.has(l.run_id))
    .map((l) => ({ line: l, run: approved.get(l.run_id)! }))
    .sort((a, b) => b.run.period.localeCompare(a.run.period))
}
