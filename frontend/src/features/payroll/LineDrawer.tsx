import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { explainPayroll, monthLabel, PAY_BASIS_LABEL, PAY_UNIT, type Employee, type PayrollLine, type PayslipItem, type usePayroll } from '../../data/payroll'
import { formatNaira, formatNumber } from '../../lib/format'
import { daysInMonth, ITEM_KIND_LABEL, workedLabel } from './payrollView'

type Save = ReturnType<typeof usePayroll>['save']

type Props = {
  line: PayrollLine
  employee: Employee | undefined
  period: string
  items: PayslipItem[]
  save: Save
  onClose: () => void
}

const num = (v: string) => Number(v.replace(/,/g, '')) || 0
const ADDABLE = [
  { value: 'earning', label: 'Extra pay (overtime, bonus)' },
  { value: 'deduction', label: 'Deduction' },
  { value: 'statutory', label: 'Statutory (pension, tax)' },
] as const

/** One person's payslip in a draft month: what they worked, their rate, and every item on it. */
export function LineDrawer({ line, employee, period, items, save, onClose }: Props) {
  const toast = useToast()
  const monthly = line.pay_basis === 'monthly'
  const days = daysInMonth(period)
  // Monthly staff are edited as days employed in the month; casuals as days or weeks worked.
  const [worked, setWorked] = useState(formatNumber(monthly ? Math.round(Number(line.units) * days) : Number(line.units)))
  const [rate, setRate] = useState(formatNumber(Number(line.rate)))
  const [kind, setKind] = useState<(typeof ADDABLE)[number]['value']>('earning')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [loanAmounts, setLoanAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(items.filter((i) => i.kind === 'loan').map((i) => [i.id, formatNumber(Number(i.amount))])),
  )
  const [busy, setBusy] = useState(false)

  const workedNum = num(worked)
  const units = monthly ? Math.min(1, workedNum / days) : workedNum
  const unitWord = line.pay_basis === 'weekly' ? 'weeks' : 'days'
  const workedError = monthly && workedNum > days ? `${monthLabel(period)} has ${days} days` : undefined
  const changedPay = Math.abs(units - Number(line.units)) > 0.00005 || num(rate) !== Number(line.rate)

  const run = async (what: () => Promise<boolean>, done: string) => {
    setBusy(true)
    const ok = await what()
    setBusy(false)
    if (ok) toast(done)
    return ok
  }

  const savePay = (e: FormEvent) => {
    e.preventDefault()
    if (workedError) return
    void run(() => save((db) => db.from('payroll_lines').update({ rate: num(rate), units: Number(units.toFixed(4)) }).eq('id', line.id)), 'Pay updated')
  }

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!label.trim() || num(amount) <= 0) return
    const ok = await run(() => save((db) => db.from('payslip_items').insert({ line_id: line.id, kind, label: label.trim(), amount: num(amount) })), 'Added to the payslip')
    if (ok) {
      setLabel('')
      setAmount('')
    }
  }

  const loans = items.filter((i) => i.kind === 'loan')
  const others = items.filter((i) => i.kind !== 'loan')

  return (
    <Drawer
      open
      onClose={onClose}
      title={employee?.full_name ?? 'Payslip'}
      subtitle={`${monthLabel(period)} · ${PAY_BASIS_LABEL[line.pay_basis]} · ${formatNaira(Number(line.rate))} ${PAY_UNIT[line.pay_basis]}`}
      footer={
        <Button size="lg" variant="primary" className="flex-1" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-1">
          <KeyValueRow label="Basic pay" calculated={explainPayroll.basic()}>
            {formatNaira(Number(line.basic))}
          </KeyValueRow>
          <KeyValueRow label="Gross pay" calculated={explainPayroll.gross()}>
            {formatNaira(Number(line.gross))}
          </KeyValueRow>
          <KeyValueRow label="Deductions" calculated={explainPayroll.deductions()}>
            − {formatNaira(Number(line.deductions))}
          </KeyValueRow>
          <KeyValueRow label="Net pay" strong calculated={explainPayroll.net()}>
            {formatNaira(Number(line.net))}
          </KeyValueRow>
        </section>

        <form onSubmit={savePay} className="flex flex-col gap-3">
          <h3 className="type-label-lg text-fg-primary">Pay this month</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={monthly ? 'Days employed' : `${unitWord[0].toUpperCase()}${unitWord.slice(1)} worked`}
              hint={monthly ? `Of ${days} · ${workedLabel(line.pay_basis, units, period)}` : undefined}
              error={workedError}
            >
              {(id) => <TextInput id={id} size="md" inputMode="decimal" suffix={monthly ? 'days' : unitWord} value={worked} onChange={(e) => setWorked(e.target.value)} />}
            </Field>
            <Field label={`Rate ${PAY_UNIT[line.pay_basis]}`}>
              {(id) => <TextInput id={id} size="md" inputMode="numeric" prefix="₦" value={rate} onChange={(e) => setRate(e.target.value)} onBlur={() => setRate(formatNumber(num(rate)))} />}
            </Field>
          </div>
          <p className="type-body-sm text-fg-tertiary">
            Basic pay {formatNaira(Math.round(num(rate) * units * 100) / 100)} = {formatNaira(num(rate))} × {monthly ? `${formatNumber(workedNum)}/${days} of the month` : `${formatNumber(workedNum)} ${unitWord}`}. The rate here is for this month only; change the employee’s
            usual rate on their record.
          </p>
          <div>
            <Button type="submit" size="sm" variant="primary" disabled={busy || !changedPay || Boolean(workedError)}>
              Save pay
            </Button>
          </div>
        </form>

        <section className="flex flex-col gap-2">
          <h3 className="type-label-lg text-fg-primary">Advance and loan repayments</h3>
          {loans.length ? (
            loans.map((i) => (
              <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_120px_auto_32px] items-center gap-2">
                <span className="truncate type-body-md text-fg-secondary">{i.label}</span>
                <TextInput
                  aria-label={`Amount for ${i.label}`}
                  size="md"
                  inputMode="numeric"
                  prefix="₦"
                  value={loanAmounts[i.id] ?? ''}
                  onChange={(e) => setLoanAmounts((m) => ({ ...m, [i.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  disabled={busy || num(loanAmounts[i.id] ?? '') <= 0 || num(loanAmounts[i.id] ?? '') === Number(i.amount)}
                  onClick={() => void run(() => save((db) => db.from('payslip_items').update({ amount: num(loanAmounts[i.id] ?? '') }).eq('id', i.id)), 'Repayment changed')}
                >
                  Save
                </Button>
                <RemoveButton label={`Skip ${i.label} this month`} disabled={busy} onClick={() => void run(() => save((db) => db.from('payslip_items').delete().eq('id', i.id)), 'Repayment skipped this month')} />
              </div>
            ))
          ) : (
            <p className="type-body-sm text-fg-tertiary">No repayments due this month.</p>
          )}
          {loans.length > 0 && <p className="type-body-sm text-fg-tertiary">{explainPayroll.loanRepayment()}</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="type-label-lg text-fg-primary">Extras and deductions</h3>
          {others.map((i) => (
            <div key={i.id} className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate type-body-md text-fg-primary">{i.label}</span>
                <span className="type-body-sm text-fg-tertiary">{ITEM_KIND_LABEL[i.kind]}</span>
              </span>
              <span className="type-label-md whitespace-nowrap text-fg-primary">
                {i.kind === 'earning' ? '+' : '−'} {formatNaira(Number(i.amount))}
              </span>
              <RemoveButton label={`Remove ${i.label}`} disabled={busy} onClick={() => void run(() => save((db) => db.from('payslip_items').delete().eq('id', i.id)), 'Removed from the payslip')} />
            </div>
          ))}
          <form onSubmit={addItem} className="flex flex-col gap-3 rounded-lg bg-canvas p-3">
            <Field label="Add to this payslip">
              {(id) => <SelectInput id={id} size="md" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} options={ADDABLE.map((a) => ({ value: a.value, label: a.label }))} />}
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-3">
              <Field label="Description">
                {(id) => <TextInput id={id} size="md" placeholder={kind === 'earning' ? 'Overtime, 3 Sundays' : kind === 'statutory' ? 'Pension' : 'Damaged crates'} value={label} onChange={(e) => setLabel(e.target.value)} />}
              </Field>
              <Field label="Amount">
                {(id) => <TextInput id={id} size="md" inputMode="numeric" prefix="₦" value={amount} onChange={(e) => setAmount(e.target.value)} />}
              </Field>
            </div>
            <div>
              <Button type="submit" size="sm" disabled={busy || !label.trim() || num(amount) <= 0}>
                Add
              </Button>
            </div>
          </form>
        </section>
      </div>
    </Drawer>
  )
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-icon-secondary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.94]"
    >
      <Trash2 size={16} strokeWidth={1.5} />
    </button>
  )
}
