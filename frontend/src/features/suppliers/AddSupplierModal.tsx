import { Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import type { Supplier } from '../../data/suppliers'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

const KINDS = ['Feed', 'Birds', 'Medication', 'Equipment'] as const
const TERMS = [
  { value: '0', label: 'On delivery' },
  { value: '7', label: '7 days after delivery' },
  { value: '14', label: '14 days after delivery' },
  { value: '30', label: '30 days after delivery' },
]

export function AddSupplierModal({ onClose }: { onClose: () => void }) {
  const { addSupplier } = useTrade()
  const toast = useToast()
  const [kind, setKind] = useState<Supplier['kind']>('Feed')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [terms, setTerms] = useState('7')
  const [opening, setOpening] = useState('0')
  const [submitted, setSubmitted] = useState(false)
  const errors = { name: name.trim() ? undefined : 'Enter the business name' }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name) return
    const trimmed = name.trim()
    const digits = phone.replace(/\D/g, '')
    if (!(await addSupplier({
      id: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: trimmed,
      short: trimmed.split(' ')[0],
      initials: trimmed.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
      kind,
      supplies: '—',
      since: new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date()),
      phone: digits.length >= 8 ? `${digits.slice(0, 4)} ••• ${digits.slice(-4)}` : '—',
      termsDays: Number(terms),
      lastPurchase: '—',
      lastPayment: '—',
    }))) return
    toast(`${trimmed} added`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add supplier"
      subtitle="Who you buy feed, birds, medication or equipment from"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-supplier">
            Save supplier
          </Button>
        </>
      }
    >
      <form id="add-supplier" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="type-label-md text-fg-primary">Supplies</span>
          <SegmentedControl fullWidth label="Supplies" options={KINDS} value={kind} onChange={setKind} />
        </div>
        <Field label="Business name" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} placeholder="Ogun Valley Feeds" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="flex gap-3">
          <Field label="Contact person" className="flex-1">
            {(id) => <TextInput id={id} placeholder="Mr. Tayo Bello" value={contact} onChange={(e) => setContact(e.target.value)} />}
          </Field>
          <Field label="Phone" className="flex-1">
            {(id) => <TextInput id={id} type="tel" leadingIcon={Phone} placeholder="0805 221 9034" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
        </div>
        <Field label="Payment terms" hint="Used to show which bills are due soon">
          {(id) => <SelectInput id={id} value={terms} onChange={(e) => setTerms(e.target.value)} options={TERMS} />}
        </Field>
        <Field label="Opening balance (we owe)" hint="Only for money owed before today">
          {(id) => (
            <TextInput
              id={id}
              prefix="₦"
              inputMode="numeric"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              onBlur={() => setOpening(formatNumber(Number(opening.replace(/,/g, '')) || 0))}
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
