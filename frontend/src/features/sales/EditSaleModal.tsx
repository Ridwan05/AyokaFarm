import { Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { todayISO } from '../../data/metrics'
import { amountOf, type Sale } from '../../data/sales'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { productOf } from './saleView'

const num = (v: string) => Number(v.replace(/,/g, '')) || 0

/**
 * Correct a sale: customer, price, date and note. Quantity isn't changed here — it moves stock and
 * pen portions — so the sale is voided and recorded again instead.
 */
export function EditSaleModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { customers, history, updateSale } = useTrade()
  const toast = useToast()
  const row = history.sales.find((s) => s.ref === sale.receipt)
  const product = productOf(sale)
  const walkIn = sale.customerId === 'one-off'
  const [customerId, setCustomerId] = useState(sale.customerId)
  const [price, setPrice] = useState(formatNumber(sale.price))
  const [date, setDate] = useState(row?.sold_on ?? sale.iso ?? todayISO())
  const [notes, setNotes] = useState(row?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const errors = {
    price: num(price) > 0 ? undefined : 'Enter a price',
    date: date && date <= todayISO() ? undefined : 'Pick a date up to today',
    // Walk-in buyers pay in full; a lower price would leave money taken over the total.
    paid: walkIn && sale.qty * num(price) < sale.paid ? `More than ₦${formatNumber(sale.paid)} was paid` : undefined,
  }
  const belowMin = num(price) < product.minPrice

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.price || errors.date || errors.paid) return
    setSaving(true)
    const ok = await updateSale(sale.receipt, {
      ...(walkIn ? {} : { customer_id: Number(customerId) }),
      unit_price: num(price),
      sold_on: date,
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (!ok) return
    toast(belowMin && !sale.pendingApproval ? `${sale.receipt} saved · below the minimum, so it waits for approval` : `${sale.receipt} saved`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Correct ${sale.receipt}`}
      subtitle={`${formatNumber(sale.qty)} ${product.unit} of ${product.name.toLowerCase()} · ₦${formatNumber(amountOf(sale))} now`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="edit-sale" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-sale" onSubmit={submit} className="flex flex-col gap-4">
        {!walkIn && (
          <Field label="Customer">
            {(id) => (
              <SelectInput id={id} leadingIcon={Users} value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`Price per ${product.unit.replace(/s$/, '')}`}
            hint={`Minimum ₦${formatNumber(product.minPrice)}`}
            error={submitted ? (errors.price ?? errors.paid) : undefined}
          >
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={price} invalid={belowMin} onChange={(e) => setPrice(e.target.value)} />}
          </Field>
          <Field label="Date of sale" error={submitted ? errors.date : undefined}>
            {(id) => <DateInput id={id} value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <Field label="Note" hint="Optional">
          {(id) => <TextInput id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
        <p className="type-body-sm text-fg-tertiary">
          To change the quantity, void this sale and record it again — quantity moves stock and pen portions.
          {belowMin ? ' A price below the minimum sends the sale back for approval.' : ''}
        </p>
      </form>
    </Modal>
  )
}
