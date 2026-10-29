import { Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast as errorToast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { createClient } from '../../lib/supabase/client'
import { friendlyError, SUPPLIER_KINDS, supplierKind, TERMS } from '../customers/partyRules'

export function AddSupplierModal({ onClose }: { onClose: () => void }) {
  const trade = useTrade()
  const toast = useToast()
  const [kind, setKind] = useState<(typeof SUPPLIER_KINDS)[number]>('Feed')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [terms, setTerms] = useState('7')
  const [opening, setOpening] = useState('0')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const openingValue = Number(opening.replace(/,/g, '')) || 0
  const errors = { name: name.trim() ? undefined : 'Enter the business name' }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name) return
    const trimmed = name.trim()
    setSaving(true)
    const { error } = await createClient()
      .from('suppliers')
      .insert({
        name: trimmed,
        short_name: trimmed.split(' ')[0],
        // The full number: it's how staff reach the supplier.
        phone: phone.trim() || null,
        address: address.trim() || null,
        supplies: [supplierKind(kind)],
        payment_terms_days: Number(terms),
        opening_balance: openingValue,
        opening_balance_source: openingValue ? source.trim() || 'Entered when the supplier was added' : null,
      })
    setSaving(false)
    if (error) return void errorToast.error(friendlyError(error.message))
    await trade.reload()
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
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-supplier" disabled={saving}>
            {saving ? 'Saving…' : 'Save supplier'}
          </Button>
        </>
      }
    >
      <form id="add-supplier" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="type-label-md text-fg-primary">Supplies</span>
          <SegmentedControl fullWidth label="Supplies" options={SUPPLIER_KINDS} value={kind} onChange={setKind} />
        </div>
        <Field label="Business name" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} placeholder="Ogun Valley Feeds" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label="Phone" className="flex-1">
            {(id) => <TextInput id={id} type="tel" leadingIcon={Phone} placeholder="0805 221 9034" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Address or contact" className="flex-1" hint="Optional">
            {(id) => <TextInput id={id} placeholder="Mr. Tayo Bello, Ring Road" value={address} onChange={(e) => setAddress(e.target.value)} />}
          </Field>
        </div>
        <Field label="Payment terms" hint="Used to show which bills are due soon">
          {(id) => <SelectInput id={id} value={terms} onChange={(e) => setTerms(e.target.value)} options={TERMS} />}
        </Field>
        <Field label="Opening balance (we owe)" hint="Only for money owed before go-live">
          {(id) => (
            <TextInput id={id} prefix="₦" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} onBlur={() => setOpening(formatNumber(openingValue))} />
          )}
        </Field>
        {openingValue > 0 && (
          <Field label="Where the opening balance came from" hint="e.g. supplier’s statement dated 30 June">
            {(id) => <TextInput id={id} value={source} onChange={(e) => setSource(e.target.value)} />}
          </Field>
        )}
      </form>
    </Modal>
  )
}
