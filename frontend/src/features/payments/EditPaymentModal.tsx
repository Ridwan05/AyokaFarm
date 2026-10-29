import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { todayISO } from '../../data/metrics'
import type { Payment } from '../../data/payments'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

const METHODS = ['Cash', 'Transfer', 'POS'] as const
const DB = { Cash: 'cash', Transfer: 'transfer', POS: 'pos' } as const
const LABEL = { cash: 'Cash', transfer: 'Transfer', POS: 'POS' } as const
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

/** Correct a payment's date, method, reference or amount. The bills it clears are worked out again. */
export function EditPaymentModal({ payment, partyName, onClose }: { payment: Payment; partyName: string; onClose: () => void }) {
  const { updatePayment } = useTrade()
  const toast = useToast()
  const [amount, setAmount] = useState(formatNumber(payment.amount))
  const [date, setDate] = useState(payment.date)
  const [method, setMethod] = useState<(typeof METHODS)[number]>(LABEL[payment.method])
  const [reference, setReference] = useState(payment.reference ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const value = num(amount)
  const errors = {
    amount: value > 0 ? undefined : 'Enter the amount',
    date: date && date <= todayISO() ? undefined : 'Pick a date up to today',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.amount || errors.date) return
    setSaving(true)
    const ok = await updatePayment(payment.ref, { amount: value, paid_on: date, method: DB[method], reference: reference.trim() || null })
    setSaving(false)
    if (!ok) return
    toast(`${payment.ref} saved`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Correct ${payment.ref}`}
      subtitle={`${payment.direction === 'in' ? 'From' : 'To'} ${partyName}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="edit-payment" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-payment" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" error={submitted ? errors.amount : undefined}>
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => value && setAmount(formatNumber(value))} />}
          </Field>
          <Field label="Date" error={submitted ? errors.date : undefined}>
            {(id) => <DateInput id={id} value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <SegmentedControl fullWidth label="Method" options={METHODS} value={method} onChange={setMethod} />
        <Field label="Reference" hint="Transfer or POS reference (optional)">
          {(id) => <TextInput id={id} value={reference} onChange={(e) => setReference(e.target.value)} />}
        </Field>
        <p className="type-body-sm text-fg-tertiary">The bills this payment clears are worked out again from the new amount.</p>
      </form>
    </Modal>
  )
}
