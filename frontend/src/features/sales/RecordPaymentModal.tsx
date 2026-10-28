import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, SummaryBox, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { amountOf, type PaymentMethod, type Sale } from '../../data/sales'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { customerView } from './saleView'

const METHODS = ['Cash', 'Transfer', 'POS'] as const

export function RecordPaymentModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { customers, recordSalePayment, customerBalance } = useTrade()
  const toast = useToast()
  const left = amountOf(sale) - sale.paid
  const [amount, setAmount] = useState(formatNumber(left))
  const [method, setMethod] = useState<(typeof METHODS)[number]>('Transfer')
  const [error, setError] = useState<string>()
  const { name, customer } = customerView(sale, customers)
  const value = Number(amount.replace(/,/g, '')) || 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value <= 0) return setError('Enter the amount received')
    if (value > left) return setError(`Only ₦${formatNumber(left)} is left on this sale`)
    const m: PaymentMethod = method === 'POS' ? 'POS' : method === 'Cash' ? 'cash' : 'transfer'
    recordSalePayment(sale.receipt, value, m)
    toast(`₦${formatNumber(value)} recorded on ${sale.receipt}`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a payment"
      subtitle={`${sale.receipt} · ${name}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="record-payment">
            Save payment
          </Button>
        </>
      }
    >
      <form id="record-payment" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Amount received" error={error} hint={`₦${formatNumber(left)} left on this sale`}>
          {(id) => (
            <TextInput
              id={id}
              prefix="₦"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError(undefined)
              }}
              onBlur={() => value && setAmount(formatNumber(value))}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="type-label-md text-fg-primary">Method</span>
          <SegmentedControl fullWidth label="Payment method" options={METHODS} value={method} onChange={setMethod} />
        </div>
        {customer && (
          <SummaryBox>
            <KeyValueRow label={`${customer.short} owes now`} calculated>
              ₦{formatNumber(customerBalance(customer.id))}
            </KeyValueRow>
            <KeyValueRow label="New balance" strong>
              ₦{formatNumber(customerBalance(customer.id) - value)}
            </KeyValueRow>
          </SummaryBox>
        )}
      </form>
    </Modal>
  )
}
