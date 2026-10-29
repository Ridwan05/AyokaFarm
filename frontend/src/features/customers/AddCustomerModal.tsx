import { Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

const TYPES = ['Regular customer', 'One-off buyer'] as const
const CONSENT = ['Yes, they agreed', 'Not yet'] as const
const BUYS = ['Eggs', 'Broilers', 'Spent layers', 'Droppings']

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

export function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const { addCustomer } = useTrade()
  const toast = useToast()
  const [type, setType] = useState<(typeof TYPES)[number]>('Regular customer')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [area, setArea] = useState('')
  const [buys, setBuys] = useState('Eggs')
  const [consent, setConsent] = useState<(typeof CONSENT)[number]>('Yes, they agreed')
  const [opening, setOpening] = useState('0')
  const [submitted, setSubmitted] = useState(false)
  const regular = type === 'Regular customer'
  const openingValue = Number(opening.replace(/,/g, '')) || 0
  const errors = {
    name: name.trim() ? undefined : 'Enter a name',
    phone: phone.replace(/\D/g, '').length >= 10 ? undefined : 'Enter an 11-digit phone number',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || (regular && errors.phone)) return
    if (regular) {
      const trimmed = name.trim()
      if (!(await addCustomer({
        id: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: trimmed,
        short: trimmed.split(' ').slice(0, 2).join(' '),
        initials: initialsOf(trimmed),
        buys,
        since: new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date()),
        area: area.trim() || '—',
        lastSale: '—',
        whatsapp: consent === CONSENT[0],
        opening: openingValue,
        olderSales: [],
      }))) return
    }
    toast(`${name.trim()} added`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add customer"
      subtitle="Regular customers get a running statement"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-customer">
            Save customer
          </Button>
        </>
      }
    >
      <form id="add-customer" onSubmit={submit} className="flex flex-col gap-5">
        <SegmentedControl fullWidth label="Customer type" options={TYPES} value={type} onChange={setType} />
        <Field label="Name or business" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} placeholder="Adewale Poultry Traders" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="flex gap-3">
          <Field label="Phone" className="flex-1" error={submitted && regular ? errors.phone : undefined}>
            {(id) => <TextInput id={id} type="tel" leadingIcon={Phone} placeholder="0813 554 2271" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Area" className="flex-1">
            {(id) => <TextInput id={id} placeholder="Bodija market" value={area} onChange={(e) => setArea(e.target.value)} />}
          </Field>
        </div>
        <Field label="Usually buys" hint="Their first price comes from the Lists in Settings">
          {(id) => <SelectInput id={id} value={buys} onChange={(e) => setBuys(e.target.value)} options={BUYS.map((b) => ({ value: b, label: b }))} />}
        </Field>
        {regular && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="type-label-md text-fg-primary">WhatsApp receipts and statements?</span>
              <SegmentedControl fullWidth label="WhatsApp consent" options={CONSENT} value={consent} onChange={setConsent} />
            </div>
            <Field label="Opening balance" hint="Only for money owed before today">
              {(id) => (
                <TextInput id={id} prefix="₦" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} onBlur={() => setOpening(formatNumber(openingValue))} />
              )}
            </Field>
            {consent === CONSENT[0] && <p className="type-body-sm text-fg-tertiary">Their consent is saved; messages start once WhatsApp is connected.</p>}
          </>
        )}
      </form>
    </Modal>
  )
}
