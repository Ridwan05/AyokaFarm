import { Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast as errorToast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/toastContext'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { createClient } from '../../lib/supabase/client'
import { BUYS, buysKinds, buysLabel, friendlyError, REFUSED } from './partyRules'

/** Edit a customer's details (Customers & suppliers → edit). The opening balance is the owner's. */
export function EditCustomerModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const trade = useTrade()
  const user = useCurrentUser()
  const toast = useToast()
  const row = trade.catalog.customers.find((c) => String(c.id) === customerId)
  const owner = user.role === 'owner'
  const [name, setName] = useState(row?.name ?? '')
  const [short, setShort] = useState(row?.short_name ?? '')
  const [phone, setPhone] = useState(row?.phone ?? '')
  const [area, setArea] = useState(row?.area ?? '')
  const [address, setAddress] = useState(row?.address ?? '')
  const [buys, setBuys] = useState(buysLabel(row?.buys ?? []))
  const [whatsapp, setWhatsapp] = useState(row?.whatsapp_opt_in ?? false)
  const [active, setActive] = useState(row?.is_active ?? true)
  const [opening, setOpening] = useState(formatNumber(Number(row?.opening_balance ?? 0)))
  const [source, setSource] = useState(row?.opening_balance_source ?? '')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const openingValue = Number(opening.replace(/,/g, '')) || 0
  const errors = { name: name.trim() ? undefined : 'Enter a name' }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!row || errors.name) return
    setSaving(true)
    const openingChanged = owner && openingValue !== Number(row.opening_balance)
    const { data, error } = await createClient()
      .from('customers')
      .update({
        name: name.trim(),
        short_name: short.trim() || null,
        phone: phone.trim() || null,
        area: area.trim() || null,
        address: address.trim() || null,
        buys: buysKinds(buys),
        whatsapp_opt_in: whatsapp,
        is_active: active,
        ...(owner
          ? {
              opening_balance: openingValue,
              opening_balance_source: source.trim() || null,
              // A changed opening balance needs checking again (Go-live step).
              ...(openingChanged ? { opening_balance_checked: false } : {}),
            }
          : {}),
      })
      .eq('id', row.id)
      .select('id')
    setSaving(false)
    if (error) return void errorToast.error(friendlyError(error.message))
    if (!data?.length) return void errorToast.error(REFUSED)
    await trade.reload()
    toast(`${name.trim()} saved`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit customer"
      subtitle={row?.name ?? 'Customer not found'}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="edit-customer" disabled={saving || !row}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-customer" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label="Name or business" className="flex-1" error={submitted ? errors.name : undefined}>
            {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Short name" className="flex-1" hint="Used in tables">
            {(id) => <TextInput id={id} value={short} onChange={(e) => setShort(e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label="Phone" className="flex-1">
            {(id) => <TextInput id={id} type="tel" leadingIcon={Phone} value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Area" className="flex-1">
            {(id) => <TextInput id={id} value={area} onChange={(e) => setArea(e.target.value)} />}
          </Field>
        </div>
        <Field label="Address" hint="Optional">
          {(id) => <TextInput id={id} value={address} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <Field label="Usually buys">
          {(id) => <SelectInput id={id} value={buys} onChange={(e) => setBuys(e.target.value)} options={BUYS.map((b) => ({ value: b, label: b }))} />}
        </Field>
        <Switch label="Agreed to WhatsApp receipts and statements" checked={whatsapp} onChange={setWhatsapp} />
        <Switch label="Active (shows in the sale form)" checked={active} onChange={setActive} />
        {owner ? (
          <>
            <Field label="Opening balance" hint="What they owed at go-live. Changing it marks it as not yet checked.">
              {(id) => (
                <TextInput id={id} prefix="₦" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} onBlur={() => setOpening(formatNumber(openingValue))} />
              )}
            </Field>
            <Field label="Where the opening balance came from">
              {(id) => <TextInput id={id} value={source} onChange={(e) => setSource(e.target.value)} />}
            </Field>
          </>
        ) : (
          <p className="type-body-sm text-fg-tertiary">Opening balance: ₦{formatNumber(Number(row?.opening_balance ?? 0))}. Only the owner can change it.</p>
        )}
      </form>
    </Modal>
  )
}
