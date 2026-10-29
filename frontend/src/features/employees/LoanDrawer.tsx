import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Drawer } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { todayISO } from '../../data/metrics'
import { nextMonth, type Employee, type usePayroll } from '../../data/payroll'
import { useCurrentUser } from '../../data/sessionContext'
import { formatNaira, formatNumber } from '../../lib/format'
import type { TablesInsert } from '../../lib/supabase/database.types'
import { scheduleText } from './employeeView'

const KINDS = ['Salary advance', 'Loan'] as const
const REPAY_BY = ['Amount a month', 'Number of months'] as const
const METHODS = [
  { value: 'transfer', label: 'Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS' },
] as const
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

type Props = {
  employee: Employee
  save: ReturnType<typeof usePayroll>['save']
  onClose: () => void
}

/** Request (or, for the owner, record) a salary advance or an interest-free loan. */
export function LoanDrawer({ employee, save, onClose }: Props) {
  const user = useCurrentUser()
  const toast = useToast()
  const owner = user.role === 'owner'
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Salary advance')
  const [amount, setAmount] = useState('')
  const [repayBy, setRepayBy] = useState<(typeof REPAY_BY)[number]>('Amount a month')
  const [monthly, setMonthly] = useState('')
  const [months, setMonths] = useState('3')
  const [firstMonth, setFirstMonth] = useState(nextMonth(todayISO()).slice(0, 7))
  const [issued, setIssued] = useState(todayISO())
  const [method, setMethod] = useState<(typeof METHODS)[number]['value']>('transfer')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const advance = kind === 'Salary advance'
  const total = num(amount)
  // An advance comes off the next payslip in full; a loan is spread.
  const perMonth = advance ? total : repayBy === 'Amount a month' ? num(monthly) : Math.ceil(total / Math.max(1, Math.floor(num(months))))
  const first = `${firstMonth}-01`
  const schedule = scheduleText(total, perMonth, first)
  const errors = {
    amount: total > 0 ? undefined : 'Enter the amount',
    repay: advance || (perMonth > 0 && perMonth <= total) ? undefined : repayBy === 'Amount a month' ? 'Enter an amount no more than the loan' : 'Enter the number of months',
    month: /^\d{4}-\d{2}$/.test(firstMonth) ? undefined : 'Pick the first month',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.amount || errors.repay || errors.month) return
    setSaving(true)
    const ok = await save((db) =>
      db.from('employee_loans').insert({
        employee_id: employee.id,
        kind: advance ? 'advance' : 'loan',
        amount: total,
        monthly_repayment: perMonth,
        first_month: first,
        issued_on: issued,
        payment_method: method,
        reason: reason.trim() || null,
        // The owner's own entries start being repaid at once; anyone else's wait for the owner.
        status: owner ? 'active' : 'pending',
        // ref (ADV-/LN-0001) is set by a database trigger.
      } as TablesInsert<'employee_loans'>),
    )
    setSaving(false)
    if (!ok) return
    toast(owner ? `${kind} of ${formatNaira(total)} recorded for ${employee.full_name}` : `${kind} request sent to the owner`)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={owner ? 'Record advance or loan' : 'Request advance or loan'}
      subtitle={`${employee.full_name} · interest-free`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="loan" disabled={saving}>
            {saving ? 'Saving…' : owner ? 'Record' : 'Send for approval'}
          </Button>
        </>
      }
    >
      <form id="loan" onSubmit={submit} className="flex flex-col gap-5">
        <SegmentedControl fullWidth label="Kind" options={KINDS} value={kind} onChange={setKind} />
        <Field label="Amount" error={submitted ? errors.amount : undefined}>
          {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => total && setAmount(formatNumber(total))} />}
        </Field>
        {!advance && (
          <>
            <SegmentedControl fullWidth label="Repay by" options={REPAY_BY} value={repayBy} onChange={setRepayBy} />
            {repayBy === 'Amount a month' ? (
              <Field label="Repayment a month" error={submitted ? errors.repay : undefined}>
                {(id) => (
                  <TextInput id={id} prefix="₦" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} onBlur={() => num(monthly) && setMonthly(formatNumber(num(monthly)))} />
                )}
              </Field>
            ) : (
              <Field label="Number of months" hint={total && perMonth ? `About ${formatNaira(perMonth)} a month` : undefined} error={submitted ? errors.repay : undefined}>
                {(id) => <TextInput id={id} inputMode="numeric" suffix="months" value={months} onChange={(e) => setMonths(e.target.value)} />}
              </Field>
            )}
          </>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label={advance ? 'Repaid from the payslip for' : 'First repayment'} className="flex-1" error={submitted ? errors.month : undefined}>
            {(id) => <TextInput id={id} type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} />}
          </Field>
          <Field label="Paid out on" className="flex-1">
            {(id) => <TextInput id={id} type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />}
          </Field>
        </div>
        <Field label="Paid out by">
          {(id) => <SelectInput id={id} value={method} onChange={(e) => setMethod(e.target.value as typeof method)} options={[...METHODS]} />}
        </Field>
        <Field label="Reason" hint="Optional — e.g. school fees">
          {(id) => <TextInput id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {schedule && (
          <Alert tone="info" title="Repayment">
            {schedule}. Taken off payslips automatically; the owner can pause or change it.
          </Alert>
        )}
        {!owner && <p className="type-body-sm text-fg-tertiary">This waits for the owner’s approval before anything comes off a payslip.</p>}
      </form>
    </Drawer>
  )
}
