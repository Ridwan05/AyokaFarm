import { Truck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { todayISO } from '../../data/metrics'
import { totalOf, type Purchase } from '../../data/purchases'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

const METHODS = ['Cash', 'Transfer', 'POS'] as const
const DB = { Cash: 'cash', Transfer: 'transfer', POS: 'pos' } as const
const LABEL = { cash: 'Cash', transfer: 'Transfer', POS: 'POS' } as const
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

/**
 * Correct a purchase. Before it's received: date, supplier, quantity, price and what was paid.
 * Once received (birds are received when bought), what came in is fixed — only the price and payment.
 */
export function EditPurchaseModal({ purchase: p, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { suppliers, updatePurchase } = useTrade()
  const toast = useToast()
  const received = p.isReceived ?? p.kind === 'Birds'
  const [date, setDate] = useState(p.date)
  const [supplierId, setSupplierId] = useState(p.supplierId)
  const [qty, setQty] = useState(formatNumber(p.qty))
  const [price, setPrice] = useState(formatNumber(p.price))
  const [paid, setPaid] = useState(p.paidAtPurchase ? formatNumber(p.paidAtPurchase) : '')
  const [method, setMethod] = useState<(typeof METHODS)[number]>(p.method ? LABEL[p.method] : 'Transfer')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const total = num(qty) * num(price)
  const paidNow = num(paid)
  const errors = {
    qty: num(qty) > 0 ? undefined : 'Enter a quantity',
    price: num(price) > 0 ? undefined : 'Enter a price',
    paid: paidNow > total ? 'More than the total' : undefined,
    date: date && date <= todayISO() ? undefined : 'Pick a date up to today',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    const ok = await updatePurchase(p.ref, {
      ...(received ? {} : { purchased_on: date, supplier_id: Number(supplierId), quantity: num(qty) }),
      unit_price: num(price),
      amount_paid: paidNow,
      payment_method: paidNow > 0 ? DB[method] : null,
    })
    setSaving(false)
    if (!ok) return
    toast(`${p.ref} saved`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Correct ${p.ref}`}
      subtitle={`${p.item} · ₦${formatNumber(totalOf(p))} now`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="edit-purchase" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-purchase" onSubmit={submit} className="flex flex-col gap-4">
        {!received && (
          <>
            <Field label="Supplier">
              {(id) => (
                <SelectInput
                  id={id}
                  leadingIcon={Truck}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  options={suppliers.filter((s) => s.kind === p.kind || s.id === p.supplierId).map((s) => ({ value: s.id, label: s.name }))}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Quantity (${p.unit})`} error={submitted ? errors.qty : undefined}>
                {(id) => <TextInput id={id} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />}
              </Field>
              <Field label="Date of purchase" error={submitted ? errors.date : undefined}>
                {(id) => <DateInput id={id} value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
              </Field>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Price ${p.per}`} error={submitted ? errors.price : undefined}>
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />}
          </Field>
          <Field label="Paid at purchase" hint={`Total ₦${formatNumber(total)}`} error={submitted ? errors.paid : undefined}>
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} />}
          </Field>
        </div>
        {paidNow > 0 && <SegmentedControl fullWidth label="Paid how" options={METHODS} value={method} onChange={setMethod} />}
        <p className="type-body-sm text-fg-tertiary">
          {received
            ? 'It has been received, so the quantity, supplier and date are fixed. To change those, void it and record it again.'
            : 'Later payments are recorded under Payments; this is only what was paid when buying.'}
        </p>
      </form>
    </Modal>
  )
}
