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
import { BUYS, buysKinds, friendlyError } from './partyRules'

const TYPES = ['Regular customer', 'One-off buyer'] as const
const CONSENT = ['Yes, they agreed', 'Not yet'] as const

export function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const trade = useTrade()
  const toast = useToast()
  const [type, setType] = useState<(typeof TYPES)[number]>('Regular customer')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [area, setArea] = useState('')
  const [buys, setBuys] = useState<string>(BUYS[0])
  const [consent, setConsent] = useState<(typeof CONSENT)[number]>('Yes, they agreed')
  const [opening, setOpening] = useState('0')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const regular = type === 'Regular customer'
  const openingValue = Number(opening.replace(/,/g, '')) || 0
  const errors = {
    name: name.trim() ? undefined : 'Enter a name',
    phone: phone.replace(/\D/g, '').length >= 10 ? undefined : 'Enter an 11-digit phone number',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // One-off buyers don't get a record: their name goes on the sale itself.
    if (!regular) return onClose()
    setSubmitted(true)
    if (errors.name || errors.phone) return
    const trimmed = name.trim()
    setSaving(true)
    const { error } = await createClient()
      .from('customers')
      .insert({
        name: trimmed,
        short_name: trimmed.split(' ').slice(0, 2).join(' '),
        phone: phone.trim(),
        area: area.trim() || null,
        buys: buysKinds(buys),
        whatsapp_opt_in: consent === CONSENT[0],
        opening_balance: openingValue,
        opening_balance_source: openingValue ? source.trim() || 'Entered when the customer was added' : null,
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
      title="Add customer"
      subtitle="Regular customers get a running statement"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-customer" disabled={saving}>
            {regular ? (saving ? 'Saving…' : 'Save customer') : 'Close'}
          </Button>
        </>
      }
    >
      <form id="add-customer" onSubmit={submit} className="flex flex-col gap-5">
        <SegmentedControl fullWidth label="Customer type" options={TYPES} value={type} onChange={setType} />
        {regular ? (
          <>
            <Field label="Name or business" error={submitted ? errors.name : undefined}>
              {(id) => <TextInput id={id} placeholder="Adewale Poultry Traders" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Field label="Phone" className="flex-1" error={submitted ? errors.phone : undefined}>
                {(id) => <TextInput id={id} type="tel" leadingIcon={Phone} placeholder="0813 554 2271" value={phone} onChange={(e) => setPhone(e.target.value)} />}
              </Field>
              <Field label="Area" className="flex-1">
                {(id) => <TextInput id={id} placeholder="Bodija market" value={area} onChange={(e) => setArea(e.target.value)} />}
              </Field>
            </div>
            <Field label="Usually buys" hint="Their first price comes from the Lists in Settings">
              {(id) => <SelectInput id={id} value={buys} onChange={(e) => setBuys(e.target.value)} options={BUYS.map((b) => ({ value: b, label: b }))} />}
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="type-label-md text-fg-primary">WhatsApp receipts and statements?</span>
              <SegmentedControl fullWidth label="WhatsApp consent" options={CONSENT} value={consent} onChange={setConsent} />
            </div>
            <Field label="Opening balance" hint="Only for money they owed before go-live">
              {(id) => (
                <TextInput id={id} prefix="₦" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} onBlur={() => setOpening(formatNumber(openingValue))} />
              )}
            </Field>
            {openingValue > 0 && (
              <Field label="Where the opening balance came from" hint="e.g. old ledger book, page 14">
                {(id) => <TextInput id={id} value={source} onChange={(e) => setSource(e.target.value)} />}
              </Field>
            )}
            {consent === CONSENT[0] && <p className="type-body-sm text-fg-tertiary">Their consent is saved; messages start once WhatsApp is connected.</p>}
          </>
        ) : (
          <p className="type-body-md text-fg-secondary">
            One-off buyers aren’t added here. When you record the sale, choose “One-off buyer” — they pay in full and their sale needs no statement.
          </p>
        )}
      </form>
    </Modal>
  )
}
