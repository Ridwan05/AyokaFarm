import { Truck, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Checkbox, DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { allocate, daysBetween, TODAY_ISO } from '../../data/ledger'
import type { PaymentMethod } from '../../data/sales'
import { useTrade, type NewPayment } from '../../data/tradeContext'
import { formatDayMon, formatNumber } from '../../lib/format'
import { useOnline } from '../../lib/useOnline'

const DIRECTIONS = ['Received from customer', 'Paid to supplier'] as const
const METHODS = ['Cash', 'Transfer', 'POS'] as const
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

type Props = {
  direction?: 'in' | 'out'
  partyId?: string
  onClose: () => void
}

/** Money received or paid outside a sale or purchase. Clears the oldest bills first. */
export function PaymentModal({ direction: initialDirection = 'in', partyId, onClose }: Props) {
  const trade = useTrade()
  const toast = useToast()
  const [direction, setDirection] = useState(initialDirection)
  const isIn = direction === 'in'
  const parties = isIn ? trade.customers : trade.suppliers
  const [party, setParty] = useState(partyId ?? (isIn ? 'chief-bello' : 'greenfield'))
  const bills = isIn ? trade.customerOpenBills(party) : trade.supplierOpenBills(party)
  const balance = isIn ? trade.customerBalance(party) : trade.supplierBalance(party)
  const [amount, setAmount] = useState(formatNumber(isIn ? Math.min(100000, balance) : Math.max(balance, 0)))
  const [date, setDate] = useState(TODAY_ISO)
  const [method, setMethod] = useState<(typeof METHODS)[number]>('Transfer')
  const [reference, setReference] = useState(isIn ? 'TRF-89120' : 'TRF-89201')
  const [notify, setNotify] = useState(true)
  const [error, setError] = useState<string>()
  const online = useOnline()
  // P-E16: a payment saved while offline waits here and saves itself when the connection is back.
  const [queued, setQueued] = useState<NewPayment | null>(null)

  const value = num(amount)
  const allocation = allocate(bills, value)
  const current = parties.find((p) => p.id === party)!
  const oldest = bills[0]

  const switchDirection = (label: (typeof DIRECTIONS)[number]) => {
    const d = label === DIRECTIONS[0] ? 'in' : 'out'
    setDirection(d)
    const next = d === 'in' ? 'chief-bello' : 'greenfield'
    setParty(next)
    const b = d === 'in' ? trade.customerBalance(next) : trade.supplierBalance(next)
    setAmount(formatNumber(d === 'in' ? Math.min(100000, b) : Math.max(b, 0)))
  }

  const changeParty = (id: string) => {
    setParty(id)
    const b = isIn ? trade.customerBalance(id) : trade.supplierBalance(id)
    setAmount(formatNumber(Math.max(isIn ? Math.min(100000, b) : b, 0)))
  }

  const save = (p: NewPayment) => {
    const cleared = trade.recordPayment(p)
    toast(`₦${formatNumber(p.amount)} saved · ${cleared}`)
    onClose()
  }

  // Saves the queued payment once the browser reports it's back online.
  const onReconnect = useRef<(() => void) | null>(null)
  useEffect(() => () => {
    if (onReconnect.current) window.removeEventListener('online', onReconnect.current)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value <= 0) return setError('Enter the amount')
    const m: PaymentMethod = method === 'POS' ? 'POS' : method === 'Cash' ? 'cash' : 'transfer'
    const payment: NewPayment = { direction, partyId: party, amount: value, method: m, reference: reference.trim() || null, date }
    if (!online) {
      setQueued(payment)
      onReconnect.current = () => save(payment)
      window.addEventListener('online', onReconnect.current, { once: true })
      return
    }
    save(payment)
  }

  const hint = isIn
    ? `Owes ₦${formatNumber(balance)}${oldest ? ` · oldest bill ${formatDayMon(oldest.date)} (${daysBetween(oldest.date)} days)` : ''}`
    : balance > 0
      ? `We owe ₦${formatNumber(balance)}${oldest ? ` · the rest of ${oldest.ref} from ${formatDayMon(oldest.date)}` : ''}`
      : balance < 0
        ? `They hold ₦${formatNumber(-balance)} credit for us`
        : 'Nothing owed'

  return (
    <Modal
      open
      onClose={onClose}
      title={isIn ? 'Record payment' : 'Pay a supplier'}
      subtitle={isIn ? 'Money received or paid outside a sale or purchase' : 'Settles bills from purchases, oldest first'}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="payment" disabled={!!queued}>
            {queued ? 'Saving when online…' : isIn ? 'Save payment' : `Save payment · ₦${formatNumber(value)}`}
          </Button>
        </>
      }
    >
      <form id="payment" onSubmit={submit} className="flex flex-col gap-5">
        {!online && (
          <Alert tone="warning" title={queued ? 'No connection — not saved yet' : 'No connection'}>
            {queued
              ? 'This payment is kept on this computer and saves by itself when the connection is back. Keep this tab open.'
              : 'You can fill this in now. It will save by itself when the connection is back.'}
          </Alert>
        )}
        <SegmentedControl fullWidth label="Direction" options={DIRECTIONS} value={isIn ? DIRECTIONS[0] : DIRECTIONS[1]} onChange={switchDirection} />
        <Field label={isIn ? 'Customer' : 'Supplier'} hint={hint}>
          {(id) => (
            <SelectInput
              id={id}
              leadingIcon={isIn ? Users : Truck}
              value={party}
              onChange={(e) => changeParty(e.target.value)}
              options={parties.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label="Amount" className="flex-1" error={error}>
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
                onBlur={() => setAmount(formatNumber(value))}
              />
            )}
          </Field>
          <Field label="Date" className="flex-1">
            {(id) => <DateInput id={id} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="type-label-md text-fg-primary">Method</span>
          <SegmentedControl fullWidth label="Method" options={METHODS} value={method} onChange={setMethod} />
        </div>
        {method !== 'Cash' && (
          <Field label="Reference" hint={isIn ? 'Bank or POS reference, for matching later' : `From the bank app — matches ${current.short}’s statement`}>
            {(id) => <TextInput id={id} value={reference} onChange={(e) => setReference(e.target.value)} />}
          </Field>
        )}

        <div className="flex flex-col rounded-lg bg-canvas px-4 pt-3 pb-2">
          <p className="pb-1 type-overline text-fg-tertiary">{isIn ? 'Clears the oldest bills first' : 'Pays the oldest bills first'}</p>
          {allocation.length === 0 && <p className="py-2 type-body-sm text-fg-tertiary">No open bills — this is held as credit.</p>}
          {allocation.map((a) => {
            const full = a.applied >= a.before
            return (
              <div key={a.ref} className="flex items-center gap-2 py-1.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="type-label-md text-fg-primary">
                    {a.ref} · {formatDayMon(a.date)}
                  </span>
                  <span className="type-body-sm text-fg-secondary">
                    {full
                      ? `₦${formatNumber(a.before)} left → paid in full`
                      : `₦${formatNumber(a.applied)} of ₦${formatNumber(a.before)} → ₦${formatNumber(a.before - a.applied)} left`}
                  </span>
                </div>
                <Badge dot tone={full ? 'success' : 'warning'}>
                  {full ? 'Cleared' : 'Part'}
                </Badge>
              </div>
            )
          })}
          <KeyValueRow label={isIn ? 'New balance' : `We’ll owe ${current.short}`} strong calculated>
            ₦ {formatNumber(Math.max(balance - value, 0))}
          </KeyValueRow>
        </div>

        <Checkbox
          label={isIn ? `Send ${current.short} the updated statement on WhatsApp` : 'Print a payment voucher for the file'}
          checked={notify}
          onChange={setNotify}
        />
      </form>
    </Modal>
  )
}
