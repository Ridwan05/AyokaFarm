import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Form'
import { RowMenu, type MenuItem } from '../../components/ui/Menu'
import { Modal, Presence } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import type { Loan, LoanBalance, usePayroll } from '../../data/payroll'
import { formatNaira, formatNumber } from '../../lib/format'
import { scheduleText } from './employeeView'

const num = (v: string) => Number(v.replace(/,/g, '')) || 0

type Save = ReturnType<typeof usePayroll>['save']

/** The owner's actions on an advance or loan: approve, change the repayment, cancel. */
export function LoanActions({ loan, balance, save }: { loan: Loan; balance?: LoanBalance; save: Save }) {
  const toast = useToast()
  const [changing, setChanging] = useState(false)
  const set = async (status: Loan['status'], done: string) => {
    if (await save((db) => db.from('employee_loans').update({ status }).eq('id', loan.id))) toast(done)
  }
  const repaid = Number(balance?.repaid ?? 0)
  const items: MenuItem[] = []
  if (loan.status === 'pending') items.push({ label: 'Approve', onSelect: () => void set('active', `${loan.ref} approved`) })
  if (loan.status === 'pending' || loan.status === 'active') {
    items.push({ label: 'Change repayment…', onSelect: () => setChanging(true) })
    items.push({
      label: repaid > 0 ? 'Stop (write off the rest)' : 'Cancel',
      danger: true,
      onSelect: () => void set('cancelled', `${loan.ref} ${repaid > 0 ? 'stopped' : 'cancelled'}`),
    })
  }
  if (!items.length) return null
  return (
    <>
      <RowMenu label={`Actions for ${loan.ref}`} items={items} />
      <Presence>{changing && <ChangeRepaymentModal loan={loan} balance={balance} save={save} onClose={() => setChanging(false)} />}</Presence>
    </>
  )
}

function ChangeRepaymentModal({ loan, balance, save, onClose }: { loan: Loan; balance?: LoanBalance; save: Save; onClose: () => void }) {
  const toast = useToast()
  const left = Number(balance?.balance ?? loan.amount)
  const [monthly, setMonthly] = useState(formatNumber(Number(loan.monthly_repayment)))
  const [first, setFirst] = useState(loan.first_month.slice(0, 7))
  const [saving, setSaving] = useState(false)
  // An advance is repaid in one go (the database checks repayment = amount for advances).
  const advance = loan.kind === 'advance'
  const perMonth = advance ? Number(loan.amount) : num(monthly)
  const error = perMonth > 0 ? undefined : 'Enter an amount above 0'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (error) return
    setSaving(true)
    const ok = await save((db) => db.from('employee_loans').update({ monthly_repayment: perMonth, first_month: `${first}-01` }).eq('id', loan.id))
    setSaving(false)
    if (!ok) return
    toast(`${loan.ref} repayment changed`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Change repayment · ${loan.ref}`}
      subtitle={`${formatNaira(left)} still to repay`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="change-repayment" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="change-repayment" onSubmit={submit} className="flex flex-col gap-5">
        {!advance && (
          <Field label="Repayment a month" error={error}>
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} onBlur={() => setMonthly(formatNumber(num(monthly)))} />}
          </Field>
        )}
        <Field label={advance ? 'Repaid from the payslip for' : 'Repay from'} hint="Move it later to pause repayments for a month or two">
          {(id) => <TextInput id={id} type="month" value={first} onChange={(e) => setFirst(e.target.value)} />}
        </Field>
        <p className="type-body-sm text-fg-secondary">{scheduleText(left, perMonth, `${first}-01`)}</p>
        <p className="type-body-sm text-fg-tertiary">To skip just one month, remove the repayment on that month’s draft payroll instead.</p>
      </form>
    </Modal>
  )
}
