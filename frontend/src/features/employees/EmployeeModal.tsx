import { Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { todayISO } from '../../data/metrics'
import { PAY_UNIT, type Employee, type usePayroll } from '../../data/payroll'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

const BASES = ['Monthly', 'Daily', 'Weekly'] as const
const STATUSES = ['Working here', 'Has left'] as const
const toBasis = (b: (typeof BASES)[number]) => b.toLowerCase() as Employee['pay_basis']
const fromBasis = (b: Employee['pay_basis']) => (b.charAt(0).toUpperCase() + b.slice(1)) as (typeof BASES)[number]
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

type Props = {
  /** Editing this employee; adding a new one when absent. */
  employee?: Employee
  employees: Employee[]
  save: ReturnType<typeof usePayroll>['save']
  onClose: () => void
}

/** Add or edit someone on the payroll — staff with a login or casual workers without one. */
export function EmployeeModal({ employee, employees, save, onClose }: Props) {
  const { catalog } = useTrade()
  const toast = useToast()
  const [name, setName] = useState(employee?.full_name ?? '')
  const [phone, setPhone] = useState(employee?.phone ?? '')
  const [job, setJob] = useState(employee?.job_title ?? '')
  const [basis, setBasis] = useState<(typeof BASES)[number]>(employee ? fromBasis(employee.pay_basis) : 'Monthly')
  const [rate, setRate] = useState(employee ? formatNumber(Number(employee.pay_rate)) : '')
  const [started, setStarted] = useState(employee?.started_on ?? todayISO())
  const [status, setStatus] = useState<(typeof STATUSES)[number]>(employee?.left_on || employee?.is_active === false ? 'Has left' : 'Working here')
  const [leftOn, setLeftOn] = useState(employee?.left_on ?? todayISO())
  const [login, setLogin] = useState(employee?.profile_id ?? '')
  const [bank, setBank] = useState(employee?.bank_name ?? '')
  const [account, setAccount] = useState(employee?.account_number ?? '')
  const [accountName, setAccountName] = useState(employee?.account_name ?? '')
  const [notes, setNotes] = useState(employee?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const linked = new Set(employees.filter((e) => e.profile_id && e.id !== employee?.id).map((e) => e.profile_id))
  const logins = catalog.profiles.filter((p) => !linked.has(p.id))
  const left = status === 'Has left'
  const errors = {
    name: name.trim() ? undefined : 'Enter a name',
    rate: num(rate) >= 0 && rate.trim() !== '' ? undefined : 'Enter the pay rate (0 if not set yet)',
    leftOn: !left || (leftOn && leftOn >= started) ? undefined : 'Leaving date must be after the start date',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || errors.rate || errors.leftOn) return
    const row = {
      full_name: name.trim(),
      phone: phone.trim() || null,
      job_title: job.trim() || null,
      pay_basis: toBasis(basis),
      pay_rate: num(rate),
      started_on: started,
      left_on: left ? leftOn : null,
      is_active: !left,
      profile_id: login || null,
      bank_name: bank.trim() || null,
      account_number: account.trim() || null,
      account_name: accountName.trim() || null,
      notes: notes.trim() || null,
    }
    setSaving(true)
    const ok = await save((db) => (employee ? db.from('employees').update(row).eq('id', employee.id) : db.from('employees').insert(row)))
    setSaving(false)
    if (!ok) return
    toast(employee ? `${row.full_name} updated` : `${row.full_name} added to payroll`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={employee ? `Edit ${employee.full_name}` : 'Add employee'}
      subtitle="Staff with an app login and casual workers without one"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="employee" disabled={saving}>
            {saving ? 'Saving…' : employee ? 'Save changes' : 'Add employee'}
          </Button>
        </>
      }
    >
      <form id="employee" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Full name" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} placeholder="Tunde Bakare" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label="Phone" className="flex-1">
            {(id) => <TextInput id={id} type="tel" leadingIcon={Phone} placeholder="0813 554 2271" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Job" className="flex-1">
            {(id) => <TextInput id={id} placeholder="Security, cleaner, pen hand…" value={job} onChange={(e) => setJob(e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="type-label-md text-fg-primary">Paid by</span>
          <SegmentedControl fullWidth label="Pay basis" options={BASES} value={basis} onChange={setBasis} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field
            label={basis === 'Monthly' ? 'Monthly salary' : basis === 'Daily' ? 'Rate a day' : 'Rate a week'}
            className="flex-1"
            hint={basis === 'Monthly' ? 'Prorated for a part month' : `Payroll asks how many ${basis === 'Daily' ? 'days' : 'weeks'} they worked`}
            error={submitted ? errors.rate : undefined}
          >
            {(id) => (
              <TextInput
                id={id}
                prefix="₦"
                suffix={PAY_UNIT[toBasis(basis)]}
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                onBlur={() => rate.trim() && setRate(formatNumber(num(rate)))}
              />
            )}
          </Field>
          <Field label="Started" className="flex-1">
            {(id) => <TextInput id={id} type="date" value={started} onChange={(e) => setStarted(e.target.value)} />}
          </Field>
        </div>
        {employee && (
          <>
            <SegmentedControl fullWidth label="Still working here?" options={STATUSES} value={status} onChange={setStatus} />
            {left && (
              <Field label="Left on" hint="They stop appearing on payroll after this month" error={submitted ? errors.leftOn : undefined}>
                {(id) => <TextInput id={id} type="date" value={leftOn} onChange={(e) => setLeftOn(e.target.value)} />}
              </Field>
            )}
          </>
        )}
        <Field label="App login" hint="Link staff who use the app so they can see their own payslips and loans">
          {(id) => (
            <SelectInput
              id={id}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              options={[{ value: '', label: 'No login (casual worker)' }, ...logins.map((p) => ({ value: p.id, label: p.full_name }))]}
            />
          )}
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label="Bank" className="flex-1">
            {(id) => <TextInput id={id} placeholder="GTBank" value={bank} onChange={(e) => setBank(e.target.value)} />}
          </Field>
          <Field label="Account number" className="flex-1">
            {(id) => <TextInput id={id} inputMode="numeric" placeholder="0123456789" value={account} onChange={(e) => setAccount(e.target.value)} />}
          </Field>
        </div>
        <Field label="Account name">
          {(id) => <TextInput id={id} value={accountName} onChange={(e) => setAccountName(e.target.value)} />}
        </Field>
        <Field label="Notes">
          {(id) => <TextInput id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}
